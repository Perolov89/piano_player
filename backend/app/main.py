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

app = FastAPI(title="Piano Transcriber API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

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
            fmax=8000
        )
        
        # Convert to decibels
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
        
        # Get min and max dB values before normalization
        min_db = float(mel_spec_db.min())
        max_db = float(mel_spec_db.max())
        
        # Normalize to 0-1 range
        mel_spec_norm = (mel_spec_db - mel_spec_db.min()) / (mel_spec_db.max() - mel_spec_db.min())
        
        return {
            "mel_spectrogram": mel_spec_norm.tolist(),
            "db_range": {
                "min": min_db,
                "max": max_db
            },
            "sample_rate": sr,
            "duration": librosa.get_duration(y=y, sr=sr),
            "shape": mel_spec_norm.shape
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing audio: {str(e)}")

def create_midi_file(notes: List[Dict], duration: float, output_path: Path) -> None:
    """
    Create a MIDI file from the transcribed notes
    """
    # Create a PrettyMIDI object
    midi_data = pretty_midi.PrettyMIDI()
    
    # Create a piano program
    piano_program = pretty_midi.Instrument(program=0)  # 0 is the program number for acoustic grand piano
    
    # Add each note to the piano program
    for note_data in notes:
        # Create a Note object
        note = pretty_midi.Note(
            velocity=note_data['velocity'],
            pitch=note_data['note'],
            start=note_data['start_time'],
            end=note_data['end_time']
        )
        piano_program.notes.append(note)
    
    # Add the piano program to the PrettyMIDI object
    midi_data.instruments.append(piano_program)
    
    # Write out the MIDI file
    midi_data.write(str(output_path))

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
    Transcribe the uploaded audio file to MIDI
    """
    try:
        file_path = UPLOAD_DIR / filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
            
        # Process audio and get mel spectrogram
        result = process_audio(file_path)
        
        # TODO: Add actual transcription logic here
        # For now, create a mock transcription with a simple C major scale
        mock_notes = []
        for i in range(8):  # Create a C major scale
            mock_notes.append({
                "note": 60 + i,  # Start from middle C (60)
                "start_time": i * 0.5,  # Each note starts 0.5 seconds after the previous
                "end_time": (i + 1) * 0.5,  # Each note lasts 0.5 seconds
                "velocity": 100  # Fixed velocity for now
            })

        # Create the MIDI file
        midi_path = UPLOAD_DIR / f"{filename}.mid"
        create_midi_file(mock_notes, result["duration"], midi_path)

        midi_data = {
            "notes": mock_notes,
            "mel_spectrogram": result["mel_spectrogram"],
            "duration": result["duration"]
        }
        return JSONResponse(midi_data)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error transcribing audio: {str(e)}")

@app.get("/midi/{filename}")
async def get_midi_file(filename: str):
    """
    Get the generated MIDI file
    """
    try:
        midi_path = UPLOAD_DIR / f"{filename}.mid"
        if not midi_path.exists():
            return JSONResponse(
                status_code=404,
                content={"message": "MIDI file not found"}
            )
        return FileResponse(midi_path)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error retrieving MIDI file: {str(e)}"}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 