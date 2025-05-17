from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import os
from pathlib import Path
import tempfile
import json
import librosa
import numpy as np
from typing import List, Dict
import soundfile as sf
import pretty_midi
import torch
from piano_transcription_inference import PianoTranscription, sample_rate
import requests
import shutil
import logging

app = FastAPI(title="Piano Transcriber API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up project directories
PROJECT_DIR = Path(__file__).parent.parent.parent
UPLOAD_DIR = PROJECT_DIR / "uploads"
MODELS_DIR = PROJECT_DIR / "models"

# Create directories if they don't exist
UPLOAD_DIR.mkdir(exist_ok=True)
MODELS_DIR.mkdir(exist_ok=True)

# Model file path (relative to PROJECT_DIR)
MODEL_FILENAME = "CRNN_note_F1=0.9677_pedal_F1=0.9186.pth"
MODEL_PATH = MODELS_DIR / MODEL_FILENAME

# Set global flag to use piano_transcription_inference
USE_PIANO_TRANSCRIPTION = True
TRANSCRIPTOR = None
MODEL_SAMPLE_RATE = 16000  # Default sample rate

# Initialize the piano transcription model
try:
    print("Initializing piano transcription model...")
    print(f"Looking for model file at: {MODEL_PATH}")
    # Set checkpoint_path to the model file in our project
    TRANSCRIPTOR = PianoTranscription(
        device='cuda' if torch.cuda.is_available() else 'cpu',
        checkpoint_path=str(MODEL_PATH) if MODEL_PATH.exists() else None
    )
    print("Piano transcription model initialized successfully")
except Exception as e:
    print(f"Error initializing piano transcription model: {str(e)}")
    print(f"Please download the model file and place it at: {MODEL_PATH}")
    print("Falling back to librosa for transcription")
    USE_PIANO_TRANSCRIPTION = False

def process_audio(file_path: Path) -> Dict:
    """
    Process audio file and convert to mel spectrogram
    """
    try:
        # Load audio file
        y, sr = librosa.load(file_path, sr=None)
        
        # Convert to mel spectrogram
        mel_spec = librosa.feature.melspectrogram(
            y=y,
            sr=sr,
            n_mels=128,
            fmax=8000 # 8000 Hz is the maximum frequency for a piano
        )
        
        # Convert to decibels
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
        
        # Get min and max dB values before normalization
        min_db = float(mel_spec_db.min())
        max_db = float(mel_spec_db.max())
        
        # Normalize to 0-1 range
        mel_spec_norm = (mel_spec_db - mel_spec_db.min()) / (mel_spec_db.max() - mel_spec_db.min())
        
        return {
            "mel_spectrogram": mel_spec_db.tolist(),
            "db_range": {
                "min": min_db,
                "max": max_db
            },
            "sample_rate": sr,
            "duration": librosa.get_duration(y=y, sr=sr),
            "shape": mel_spec_db.shape
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing audio: {str(e)}")

@app.post("/upload")
async def upload_audio(file: UploadFile = File(...)):
    """
    Upload a WAV file and convert to mel spectrogram
    """
    try:
        # Validate file type
        if not file.filename.lower().endswith('.wav'):
            raise HTTPException(status_code=400, detail="Only WAV files are supported")
        
        # Save the uploaded file
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Process the audio file
        result = process_audio(file_path)
        
        return JSONResponse({
            "message": "File processed successfully",
            "filename": file.filename,
            "mel_spectrogram": result["mel_spectrogram"],
            "db_range": result["db_range"],
            "sample_rate": result["sample_rate"],
            "duration": result["duration"],
            "shape": result["shape"]
        })
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/transcribe")
async def transcribe_audio(filename: str = Form(...)):
    """
    Transcribe the uploaded audio file and return notes data
    """
    try:
        file_path = UPLOAD_DIR / filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        if USE_PIANO_TRANSCRIPTION and TRANSCRIPTOR:
            # Use Piano Transcription model
            # Load audio file specifically for the model (resampling to MODEL_SAMPLE_RATE)
            y, sr = librosa.load(file_path, sr=MODEL_SAMPLE_RATE)
            
            # Create a temp directory for the MIDI file
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_midi_path = os.path.join(temp_dir, "output.mid")
                
                # Transcribe audio using the model
                transcribed_dict = TRANSCRIPTOR.transcribe(y, temp_midi_path)
                
                # Load the saved MIDI file
                midi_data = pretty_midi.PrettyMIDI(temp_midi_path)
                
                # Convert MIDI to our notes format
                notes = []
                for instrument in midi_data.instruments:
                    for note in instrument.notes:
                        notes.append({
                            "note": int(note.pitch),
                            "start_time": float(note.start),
                            "end_time": float(note.end),
                            "velocity": int(note.velocity)
                        })
                
                # Sort notes by start time
                notes.sort(key=lambda x: x["start_time"])
                
                # Get audio duration
                duration = librosa.get_duration(y=y, sr=sr)
        else:
            # Fall back to librosa for transcription
            print("Using librosa fallback for transcription")
            y, sr = librosa.load(file_path, sr=None)
            
            # Process audio to get mel spectrogram
            result = process_audio(file_path)
            
            # Get onset frames
            onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units='frames')
            onset_times = librosa.frames_to_time(onset_frames, sr=sr)
            
            # Get pitch using harmonic-percussive separation and chroma
            y_harmonic = librosa.effects.harmonic(y)
            pitches, magnitudes = librosa.piptrack(y=y_harmonic, sr=sr, threshold=0.1)
            
            notes = []
            for i, onset_time in enumerate(onset_times):
                # Get pitch at onset time
                onset_frame = onset_frames[i]
                pitch_slice = pitches[:, onset_frame]
                magnitude_slice = magnitudes[:, onset_frame]
                
                # Find the pitch with highest magnitude
                if magnitude_slice.max() > 0:
                    best_pitch_idx = magnitude_slice.argmax()
                    frequency = pitch_slice[best_pitch_idx]
                    
                    if frequency > 0:
                        # Convert frequency to MIDI note
                        midi_note = librosa.hz_to_midi(frequency)
                        
                        # Estimate note duration (use next onset or remaining audio)
                        end_time = onset_times[i + 1] if i + 1 < len(onset_times) else result["duration"]
                        
                        notes.append({
                            "note": int(round(midi_note)),
                            "start_time": float(onset_time),
                            "end_time": float(end_time),
                            "velocity": int(magnitude_slice.max() * 127)
                        })
            
            duration = result["duration"]
        
        return JSONResponse({
            "notes": notes,
            "duration": duration,
            "model_used": "Piano Transcription" if USE_PIANO_TRANSCRIPTION and TRANSCRIPTOR else "Librosa (fallback)"
        })
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error transcribing audio: {str(e)}")

@app.post("/generate-midi")
async def generate_midi(filename: str = Form(...)):
    """
    Transcribe audio and return a MIDI file
    """
    try:
        file_path = UPLOAD_DIR / filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as temp_midi:
            midi_path = temp_midi.name
            
            if USE_PIANO_TRANSCRIPTION and TRANSCRIPTOR:
                # Use Piano Transcription model
                # Load audio file specifically for the model (resampling to MODEL_SAMPLE_RATE)
                y, sr = librosa.load(file_path, sr=MODEL_SAMPLE_RATE)
                
                # Transcribe audio using the model
                TRANSCRIPTOR.transcribe(y, midi_path)
            else:
                # Fall back to librosa for transcription
                y, sr = librosa.load(file_path, sr=None)
                
                # Create a new MIDI file
                midi = pretty_midi.PrettyMIDI()
                piano_program = pretty_midi.instrument_name_to_program('Acoustic Grand Piano')
                piano = pretty_midi.Instrument(program=piano_program)
                
                # Get onset frames
                onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units='frames')
                onset_times = librosa.frames_to_time(onset_frames, sr=sr)
                
                # Get pitch using harmonic-percussive separation and chroma
                y_harmonic = librosa.effects.harmonic(y)
                pitches, magnitudes = librosa.piptrack(y=y_harmonic, sr=sr, threshold=0.1)
                
                for i, onset_time in enumerate(onset_times):
                    # Get pitch at onset time
                    onset_frame = onset_frames[i]
                    pitch_slice = pitches[:, onset_frame]
                    magnitude_slice = magnitudes[:, onset_frame]
                    
                    # Find the pitch with highest magnitude
                    if magnitude_slice.max() > 0:
                        best_pitch_idx = magnitude_slice.argmax()
                        frequency = pitch_slice[best_pitch_idx]
                        
                        if frequency > 0:
                            # Convert frequency to MIDI note
                            midi_note = librosa.hz_to_midi(frequency)
                            
                            # Estimate note duration (use next onset or remaining audio)
                            end_time = onset_times[i + 1] if i + 1 < len(onset_times) else librosa.get_duration(y=y, sr=sr)
                            velocity = int(magnitude_slice.max() * 127)
                            
                            # Create a Note object
                            note = pretty_midi.Note(
                                velocity=velocity,
                                pitch=int(round(midi_note)),
                                start=onset_time,
                                end=end_time
                            )
                            
                            # Add note to the instrument
                            piano.notes.append(note)
                
                # Add the instrument to the PrettyMIDI object
                midi.instruments.append(piano)
                
                # Write out the MIDI data
                midi.write(midi_path)
            
            # Return the MIDI file
            return FileResponse(
                path=midi_path,
                filename=f"{Path(filename).stem}.mid",
                media_type="audio/midi"
            )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating MIDI: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 