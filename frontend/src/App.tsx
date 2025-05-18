import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import WaveSurfer from 'wavesurfer.js'
import ABCJS from 'abcjs'
import './App.css'

const API_URL = 'http://localhost:8000'

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

// Helper function to convert MIDI note number to note name
const getNoteName = (midiNote: number): string => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  return `${noteNames[noteIndex]}${octave}`;
};

// Precompute the 88-key pattern (true = black, false = white), starting from A0 (MIDI 21)
const BLACK_KEYS_88 = [
  false, true, false, false, true, false, true, false, false, true, false, true, // A0 - G#1
  false, true, false, false, true, false, true, false, false, true, false, true, // A1 - G#2
  false, true, false, false, true, false, true, false, false, true, false, true, // A2 - G#3
  false, true, false, false, true, false, true, false, false, true, false, true, // A3 - G#4
  false, true, false, false, true, false, true, false, false, true, false, true, // A4 - G#5
  false, true, false, false, true, false, true, false, false, true, false, true, // A5 - G#6
  false, true, false, false, true, false, true, false, false, true, false, true, // A6 - G#7
  false, true, false, false, true, false, true, false // A7 - C8 (last 4 keys)
];

// Piano roll visualization
const PianoRoll = ({ notes, duration, currentTime }: { notes: any[], duration: number, currentTime: number }) => {
  const pianoRollRef = useRef<HTMLCanvasElement>(null);
  const PIXELS_PER_SECOND = 50;
  const KEY_WIDTH = 10; // Each key is a vertical stripe
  const TOTAL_KEYS = 88;

  // Effect for drawing piano roll and tracker
  useEffect(() => {
    const canvas = pianoRollRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size: width = 88 keys, height = duration
    const width = TOTAL_KEYS * KEY_WIDTH;
    const height = duration * PIXELS_PER_SECOND;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    // Draw piano keys background (vertical stripes)
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const x = i * KEY_WIDTH;
      ctx.fillStyle = BLACK_KEYS_88[i] ? '#333' : '#fff';
      ctx.fillRect(x, 0, KEY_WIDTH, height);
      ctx.strokeStyle = '#ccc';
      ctx.strokeRect(x, 0, KEY_WIDTH, height);
    }

    // Draw notes
    notes.forEach(note => {
      const keyIdx = note.note - 21;
      const x = keyIdx * KEY_WIDTH; // A0 at left
      const y = height - note.end_time * PIXELS_PER_SECOND;
      const noteHeight = (note.end_time - note.start_time) * PIXELS_PER_SECOND;
      // Use yellow for black keys, blue for white keys
      const isBlack = BLACK_KEYS_88[keyIdx];
      ctx.fillStyle = isBlack
        ? 'rgba(255, 220, 0, 0.85)'
        : `rgba(0, 100, 255, ${note.velocity / 127})`;
      ctx.fillRect(x, y, KEY_WIDTH, noteHeight);
      // Add a thin white border for all notes
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, KEY_WIDTH - 1, noteHeight - 1);
    });

    // Draw time markers (horizontal lines)
    ctx.fillStyle = '#666';
    ctx.font = '8px Arial';
    for (let t = 0; t <= duration; t += 1) {
      const y = height - t * PIXELS_PER_SECOND;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.strokeStyle = '#ccc';
      ctx.stroke();
      ctx.fillText(`${t}s`, 2, y - 2);
    }

    // Draw note labels (at bottom)
    ctx.fillStyle = '#000';
    ctx.font = '8px Arial';
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const x = i * KEY_WIDTH + 2;
      const noteName = getNoteName(i + 21);
      ctx.save();
      ctx.translate(x + KEY_WIDTH / 2, height - 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(noteName, 0, 0);
      ctx.restore();
    }

    // Draw time tracker (horizontal red line)
    const trackerY = height - currentTime * PIXELS_PER_SECOND;
    ctx.beginPath();
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.moveTo(0, trackerY);
    ctx.lineTo(width, trackerY);
    ctx.stroke();
  }, [notes, duration, currentTime]);

  return (
    <div className="w-full overflow-x-auto">
      <canvas
        ref={pianoRollRef}
        className="w-full bg-white rounded-lg"
        style={{ minWidth: '100%' }}
      />
    </div>
  );
};

// Sheet Music visualization
const SheetMusic = ({ notes, duration }: { notes: any[], duration: number }) => {
  const sheetMusicRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notes.length || !sheetMusicRef.current) return;

    // Convert MIDI notes to ABC notation
    const convertToABC = (notes: any[]): string => {
      // ABC header
      let abc = 'X:1\nT:Piano Transcription\nM:4/4\nL:1/16\nK:C\n';
      
      // Sort notes by start time
      const sortedNotes = [...notes].sort((a, b) => a.start_time - b.start_time);
      
      // Group notes by time to create chords
      const timeMap = new Map<number, any[]>();
      sortedNotes.forEach(note => {
        // Round to nearest 1/16 note for more precise timing
        const startTime = Math.round(note.start_time * 16) / 16;
        if (!timeMap.has(startTime)) {
          timeMap.set(startTime, []);
        }
        timeMap.get(startTime)!.push(note);
      });

      // Sort times
      const sortedTimes = Array.from(timeMap.keys()).sort((a, b) => a - b);

      // Convert to ABC notation
      let currentBar = 0;
      let currentTime = 0;
      let abcNotes = '';

      sortedTimes.forEach(time => {
        // Add bar lines (every 4 beats)
        while (currentTime + 1 <= time) {
          abcNotes += '|';
          currentBar++;
          currentTime += 1;
        }

        // Get notes at this time
        const chordNotes = timeMap.get(time)!;
        
        // Convert MIDI notes to ABC notation
        const abcChord = chordNotes.map(note => {
          // MIDI note 60 is middle C (C4)
          const midiNote = note.note;
          const noteIndex = ((midiNote - 60) % 12 + 12) % 12;
          const octave = Math.floor((midiNote - 60) / 12) + 4;
          
          // Convert to note name
          const noteNames = ['c', '^c', 'd', '^d', 'e', 'f', '^f', 'g', '^g', 'a', '^a', 'b'];
          let abcNote = noteNames[noteIndex];
          
          // Add octave markers
          if (octave < 4) {
            // Lower octaves use commas
            abcNote = ','.repeat(4 - octave) + abcNote;
          } else if (octave > 4) {
            // Higher octaves use apostrophes
            abcNote = abcNote + "'".repeat(octave - 4);
          }
          
          // Add duration based on note length
          const duration = note.end_time - note.start_time;
          if (duration <= 0.0625) { // 1/16 note
            abcNote += '/';
          } else if (duration <= 0.125) { // 1/8 note
            abcNote += '/2';
          } else if (duration <= 0.25) { // 1/4 note
            // Default duration, no suffix needed
          } else if (duration <= 0.5) { // 1/2 note
            abcNote += '2';
          } else { // Whole note
            abcNote += '1';
          }
          
          return abcNote;
        }).join('');

        // Add chord or single note
        abcNotes += chordNotes.length > 1 ? `[${abcChord}]` : abcChord;
      });

      // Add final bar line
      abcNotes += '|';

      return abc + abcNotes;
    };

    // Generate ABC notation
    const abcNotation = convertToABC(notes);
    console.log('ABC Notation:', abcNotation); // Debug log

    // Render sheet music
    ABCJS.renderAbc(sheetMusicRef.current, abcNotation, {
      responsive: 'resize',
      staffwidth: 600,
      scale: 1.2,
      paddingtop: 20,
      paddingbottom: 20,
      paddingright: 20,
      paddingleft: 20,
      add_classes: true,
      selectionColor: '#00ff00',
    });
  }, [notes, duration]);

  return (
    <div className="w-full overflow-x-auto">
      <div ref={sheetMusicRef} className="w-full bg-white rounded-lg" />
    </div>
  );
};

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [transcription, setTranscription] = useState<any>(null)
  const [melSpectrogram, setMelSpectrogram] = useState<number[][] | null>(null)
  const [audioMetadata, setAudioMetadata] = useState<{
    sample_rate: number;
    duration: number;
    shape: number[];
    db_range: {
      min: number;
      max: number;
    };
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
      // Load the new file into WaveSurfer
      if (wavesurferRef.current) {
        wavesurferRef.current.load(URL.createObjectURL(selectedFile))
      }
    }
  }

  const togglePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause()
    }
  }

  // Helper: interpolate between two colors
  function interpolateColor(color1: number[], color2: number[], t: number): number[] {
    return color1.map((c, i) => Math.round(c + (color2[i] - c) * t));
  }

  // Helper: get plasma-like color for a value in [0, 1]
  function plasmaColor(norm: number): [number, number, number] {
    // Color stops: black, dark blue, magenta, orange, white
    const stops: [number, number, number][] = [
      [0, 0, 0],         // Black
      [13, 8, 135],      // Dark Blue (#0d0887)
      [204, 70, 120],    // Magenta (#cc4678)
      [252, 166, 54],    // Orange (#fca636)
      [255, 255, 255],   // White
    ];
    const n = stops.length - 1;
    const scaled = norm * n;
    const idx = Math.floor(scaled);
    const t = scaled - idx;
    if (idx >= n) return [stops[n][0], stops[n][1], stops[n][2]];
    const interp = interpolateColor(stops[idx], stops[idx + 1], t);
    return [interp[0], interp[1], interp[2]];
  }

  const drawMelSpectrogram = (data: number[][]) => {
    const canvas = canvasRef.current
    if (!canvas || !audioMetadata) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size with extra space for labels
    const padding = { top: 60, right: 120, bottom: 40, left: 120 }
    const maxWidth = 1000 // Maximum width for the spectrogram
    const scale = Math.min(1, maxWidth / data[0].length)
    const scaledWidth = Math.floor(data[0].length * scale)
    
    canvas.width = scaledWidth + padding.left + padding.right
    canvas.height = data.length + padding.top + padding.bottom

    // Clear canvas
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Create image data for spectrogram
    const imageData = ctx.createImageData(scaledWidth, data.length)
    const pixels = imageData.data

    // dB normalization (handle negative dB correctly)
    let minDb = audioMetadata.db_range.min
    let maxDb = audioMetadata.db_range.max
    // If minDb > maxDb, swap (should be -80 to 0, not 0 to -80)
    if (minDb > maxDb) {
      [minDb, maxDb] = [maxDb, minDb]
    }
    const dbRange = maxDb - minDb

    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < scaledWidth; j++) {
        const value = data[i][Math.floor(j / scale)]
        const idx = (i * scaledWidth + j) * 4
        // Normalize value to [0, 1] (0 dB = 1, -80 dB = 0)
        let norm = (value - minDb) / dbRange
        norm = Math.max(0, Math.min(1, norm))
        const [r, g, b] = plasmaColor(norm)
        pixels[idx] = r
        pixels[idx + 1] = g
        pixels[idx + 2] = b
        pixels[idx + 3] = 255
      }
    }

    // Draw the spectrogram
    ctx.putImageData(imageData, padding.left, padding.top)

    // Draw color scale (vertical bar)
    const scaleWidth = 50
    const scaleHeight = data.length
    for (let y = 0; y < scaleHeight; y++) {
      const norm = y / (scaleHeight - 1) // 0 at top (0 dB), 1 at bottom (-80 dB)
      const [r, g, b] = plasmaColor(1 - norm)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(canvas.width - padding.right + 10, padding.top + y, scaleWidth, 1)
    }

    // Draw dB scale labels (0 dB at top, -80 dB at bottom)
    ctx.fillStyle = 'black'
    ctx.font = '16px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(`${maxDb.toFixed(1)} dB`, canvas.width - padding.right + 65, padding.top)
    ctx.fillText(`${minDb.toFixed(1)} dB`, canvas.width - padding.right + 65, padding.top + scaleHeight)

    // Draw frequency scale (mel, linear, with more ticks)
    ctx.textAlign = 'right'
    const maxFreq = 8000; // Match backend fmax
    const freqTicks = [0, 100, 300, 1000, 3000, 6000, 10000, Math.round(maxFreq)]
    freqTicks.forEach(f => {
      const y = padding.top + data.length - (f / maxFreq) * data.length
      ctx.fillText(`${f}`, padding.left - 5, y)
      ctx.beginPath()
      ctx.strokeStyle = '#eee'
      ctx.moveTo(padding.left, y)
      ctx.lineTo(padding.left + scaledWidth, y)
      ctx.stroke()
    })

    // Draw axis labels
    ctx.save()
    ctx.translate(padding.left - 80, canvas.height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.font = '18px Arial'
    ctx.fillText('Frequency (Hz)', 0, 0)
    ctx.restore()

    // Draw time tracker
    if (wavesurferRef.current) {
      const currentTime = wavesurferRef.current.getCurrentTime()
      const duration = wavesurferRef.current.getDuration()
      const progress = currentTime / duration
      const trackerX = padding.left + (scaledWidth * progress)
      
      // Draw vertical line
      ctx.beginPath()
      ctx.strokeStyle = '#FF0000'
      ctx.lineWidth = 2
      ctx.moveTo(trackerX, padding.top)
      ctx.lineTo(trackerX, padding.top + data.length)
      ctx.stroke()

      // Draw time label
      ctx.fillStyle = '#FF0000'
      ctx.font = '14px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(formatTime(currentTime), trackerX, padding.top + data.length + 20)
    }
  }

  // Add effect to update time tracker
  useEffect(() => {
    if (melSpectrogram && wavesurferRef.current) {
      const updateTracker = () => {
        drawMelSpectrogram(melSpectrogram)
      }
      
      wavesurferRef.current.on('audioprocess', updateTracker)
      wavesurferRef.current.on('interaction', updateTracker)
      
      return () => {
        if (wavesurferRef.current) {
          wavesurferRef.current.un('audioprocess', updateTracker)
          wavesurferRef.current.un('interaction', updateTracker)
        }
      }
    }
  }, [melSpectrogram])

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)

    try {
      // Upload the file
      const uploadResponse = await axios.post(`${API_URL}/upload`, formData)
      const { mel_spectrogram, sample_rate, duration, shape, db_range } = uploadResponse.data

      // Update state with mel spectrogram data and metadata
      setMelSpectrogram(mel_spectrogram)
      setAudioMetadata({ sample_rate, duration, shape, db_range })

      // Request transcription
      const transcribeResponse = await axios.post(
        `${API_URL}/transcribe`,
        new URLSearchParams({ filename: file.name }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )
      setTranscription(transcribeResponse.data)

      // Initialize waveform if not already done
      if (!wavesurferRef.current && waveformRef.current) {
        wavesurferRef.current = WaveSurfer.create({
          container: waveformRef.current,
          waveColor: '#4a9eff',
          progressColor: '#1e40af',
          height: 100,
          cursorColor: '#1e40af',
          barWidth: 2,
          barGap: 1
        })

        // Add event listeners
        wavesurferRef.current.on('play', () => {
          console.log('Play event');
          setIsPlaying(true);
        });
        
        wavesurferRef.current.on('pause', () => {
          console.log('Pause event');
          setIsPlaying(false);
        });
        
        wavesurferRef.current.on('finish', () => {
          console.log('Finish event');
          setIsPlaying(false);
        });
        
        wavesurferRef.current.on('audioprocess', () => {
          if (wavesurferRef.current) {
            const time = wavesurferRef.current.getCurrentTime();
            console.log('Audio process - current time:', time);
            setCurrentTime(time);
          }
        });
        
        wavesurferRef.current.on('ready', () => {
          if (wavesurferRef.current) {
            const dur = wavesurferRef.current.getDuration();
            console.log('Ready event - duration:', dur);
            setDuration(dur);
          }
        });
        
        wavesurferRef.current.on('interaction', () => {
          if (wavesurferRef.current) {
            const time = wavesurferRef.current.getCurrentTime();
            console.log('Interaction - current time:', time);
            setCurrentTime(time);
          }
        });

        // Load the audio file
        wavesurferRef.current.load(URL.createObjectURL(file));
      }
    } catch (error: any) {
      setError(error.response?.data?.detail || 'An error occurred during upload')
      console.error('Error:', error)
    } finally {
      setIsUploading(false)
    }
  }

  // Remove the old WaveSurfer initialization effect since we're now doing it in handleUpload
  useEffect(() => {
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (melSpectrogram) {
      drawMelSpectrogram(melSpectrogram)
    }
  }, [melSpectrogram])

  return (
    <div className="piano-transcriber">
      <div className="piano-transcriber-container">
        <div className="piano-transcriber-card">
          <div className="max-w-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <h1 className="piano-transcriber-title">Piano Transcriber</h1>
                
                {/* File Upload */}
                <div className="piano-transcriber-section">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <label htmlFor="file-upload" className="piano-transcriber-file-label">
                      Choose File
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".wav"
                      onChange={handleFileChange}
                      className="piano-transcriber-file-input"
                    />
                    {file && (
                      <div className="piano-transcriber-file-name">{file.name}</div>
                    )}
                  </div>
                  <button
                    onClick={handleUpload}
                    disabled={!file || isUploading}
                    className="piano-transcriber-button mt-4"
                  >
                    {isUploading ? 'Processing...' : 'Upload & Transcribe'}
                  </button>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="piano-transcriber-error">
                    {error}
                  </div>
                )}
                
                {/* Waveform Display with Playback Controls */}
                {file && (
                  <div className="piano-transcriber-section">
                    <h2 className="piano-transcriber-section-title">Waveform</h2>
                    <div ref={waveformRef} className="piano-transcriber-waveform" />
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-600 font-medium">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </div>
                      <div className="flex space-x-4">
                        <button
                          onClick={togglePlayPause}
                          className="piano-transcriber-button px-6"
                        >
                          {isPlaying ? 'Pause' : 'Play'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Piano Roll Visualization */}
                {transcription && (
                  <>
                    <div className="piano-transcriber-section piano-roll-section">
                      <h2 className="piano-transcriber-section-title">Piano Roll</h2>
                      <div className="piano-roll-canvas-wrapper">
                        <PianoRoll 
                          notes={transcription.notes} 
                          duration={transcription.duration}
                          currentTime={currentTime}
                        />
                      </div>
                    </div>
                    <div className="piano-transcriber-section">
                      <h2 className="piano-transcriber-section-title">Sheet Music</h2>
                      <SheetMusic 
                        notes={transcription.notes} 
                        duration={transcription.duration}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
