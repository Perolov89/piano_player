# piano_player

🎹 Piano Transcription App – Detailed Project Plan
📌 Phase 1: MVP – Offline Transcription and Visualization
🔹 Objective:
Allow user to upload a piano audio recording, transcribe it to MIDI using a pre-trained model, and visualize the result on a virtual piano interface.

1. Setup & Environment
Task	Tools	Notes
Set up version control	Git + GitHub	Use branching for frontend/backend separation
Create virtual environments	venv or conda	Separate Python environments for model/processing
Set up base React frontend	React + Vite	Fast startup, Tailwind for UI
Set up Python backend API	FastAPI or Flask	For processing and serving model

2. Audio Input & Preprocessing
Task	Tools	Notes
Accept .wav file upload	React + Axios → FastAPI endpoint	
Convert audio to mel spectrogram	Librosa	Normalize, resample to 16kHz, pad/trim
(Optional) Show waveform preview	Wavesurfer.js or similar	Helpful UX feature

3. Transcription Backend
Task	Tools	Notes
Integrate pre-trained model	Onsets and Frames	Use checkpoint or fine-tune
Run transcription on spectrogram	PyTorch + Librosa	Returns predicted notes, timing
Convert prediction to MIDI	pretty_midi or mido	Can export .mid file

4. Piano Visualization
Task	Tools	Notes
Virtual piano UI	React + Canvas or SVG	Map MIDI to key animations
Sync note playback	Tone.js or Web Audio API	For audio+key syncing
Allow slow-mo / pause / rewind	Basic transport controls	Enhances review experience

5. Basic UI/UX
Task	Tools	Notes
Home page: Upload, record, or play	React	
Loading state during processing	Spinner/progress bar	
Playback controls	Custom or Tone.js transport	

6. Testing & Deployment
Task	Tools	Notes
Backend unit tests	PyTest	For model input/output, audio handling
Frontend testing	Playwright or Jest	For UI interactions
Deployment	Vercel (frontend) + Render / Railway (backend)	Easy, free-tier hosting

✅ Deliverable:
Upload piano audio → Transcribed MIDI

Interactive piano roll view in browser

🚀 Phase 2: Real-Time Transcription (Advanced)
🔹 Objective:
Transcribe live audio input (e.g., mic or MIDI keyboard) into real-time MIDI output and visualize instantly.

1. Live Audio Capture
Task	Tools	Notes
Add mic recording feature	MediaRecorder API	Stream to backend
Buffer audio in chunks	WebSockets or polling	Small 1–2 sec window chunks

2. Streamed Transcription
Task	Tools	Notes
Slice audio into windows	1–2s overlapping segments	Need stable latency window
Feed to model in real-time	Optimize model size (ONNX)	Use CPU/GPU depending on device
Send notes back to frontend	WebSocket or REST	Show current active keys

3. Visualization Updates
Task	Tools	Notes
Animate keys in real-time	React + Canvas or SVG	Smooth animations
Highlight errors (missed or extra notes)	Compare to reference MIDI	Optional, for learning mode

🔮 Phase 3: Learning Mode + MIDI Import
🔹 Objective:
Let users upload a target MIDI file, then play along in real-time and get feedback on timing and accuracy.

Feature	Description
Side-by-side: original vs. user playing	Overlay timing deviations
Visual cues (green = correct, red = off)	Gamify the learning
Scoring & feedback	Show accuracy %, speed, timing error

🧠 Dataset & Model Training Plan (Parallel Workstream)
Task	Tools	Notes
Download & inspect MAESTRO	Google MAESTRO	Use v3, split train/val/test
Fine-tune Onsets and Frames	PyTorch + checkpoint	Use Linux+3070
Evaluate accuracy	mir_eval, MAESTRO metrics	Onset, offset, F1

⚙️ Infrastructure & Resources
Recommended System Use:
Task	System
Model inference	MacBook M1 (React UI + API)
Model training / fine-tuning	Linux + RTX 3070
Deployment	Vercel (React), Render/Railway (API)

📂 Folder Structure (Suggestion)
css
Kopiera
Redigera
/piano-transcriber
  ├── backend
  │   ├── main.py
  │   ├── model/
  │   └── audio_utils/
  ├── frontend
  │   ├── src/
  │   └── public/
  ├── datasets/
  └── README.md
🧭 Final Notes
✅ Phase 1 alone makes a solid portfolio project

🧪 Collect user recordings later for fine-tuning

🌐 Consider a browser-only version with ONNX later for full portability