# Piano Transcriber

A full-stack application that transcribes piano audio recordings into MIDI using AI, featuring a modern web interface with real-time visualization.

## Features

- 🎹 Upload piano audio recordings (.wav format)
- 🎵 AI-powered transcription to MIDI
- 🎼 Interactive piano roll visualization
- 🔊 Audio playback with waveform display
- ⚡ Real-time processing and feedback

## Project Structure

```
piano-transcriber/
├── backend/           # FastAPI server
├── frontend/         # React + Vite application
└── shared/           # Shared utilities and types
```

## Getting Started

### Prerequisites

- Python 3.8+
- Node.js 16+
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Development

- Backend runs on `http://localhost:8000`
- Frontend runs on `http://localhost:5173`
- API documentation available at `http://localhost:8000/docs`

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
