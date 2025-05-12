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
        
        # Normalize to 0-1 range
        mel_spec_norm = (mel_spec_db - mel_spec_db.min()) / (mel_spec_db.max() - mel_spec_db.min())
        
        return {
            "mel_spectrogram": mel_spec_norm.tolist(),
            "sample_rate": sr,
            "duration": librosa.get_duration(y=y, sr=sr),
            "shape": mel_spec_norm.shape
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

        midi_data = {
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
        # TODO: Add actual MIDI file generation logic here
        # For now, return a mock MIDI file
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