import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import WaveSurfer from 'wavesurfer.js'
import './App.css'

const API_URL = 'http://localhost:8000'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [transcription, setTranscription] = useState<any>(null)
  const [melSpectrogram, setMelSpectrogram] = useState<number[][] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }

  const drawMelSpectrogram = (data: number[][]) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = data[0].length
    canvas.height = data.length

    // Create image data
    const imageData = ctx.createImageData(canvas.width, canvas.height)
    const pixels = imageData.data

    // Convert mel spectrogram to grayscale image
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        const value = Math.floor(data[i][j] * 255)
        const idx = (i * canvas.width + j) * 4
        pixels[idx] = value     // R
        pixels[idx + 1] = value // G
        pixels[idx + 2] = value // B
        pixels[idx + 3] = 255   // A
      }
    }

    // Draw the image
    ctx.putImageData(imageData, 0, 0)
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)

    try {
      // Upload the file
      const uploadResponse = await axios.post(`${API_URL}/upload`, formData)
      const { mel_spectrogram, duration } = uploadResponse.data

      // Update state with mel spectrogram data
      setMelSpectrogram(mel_spectrogram)

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
          height: 100
        })
        wavesurferRef.current.load(URL.createObjectURL(file))
      }
    } catch (error: any) {
      setError(error.response?.data?.detail || 'An error occurred during upload')
      console.error('Error:', error)
    } finally {
      setIsUploading(false)
    }
  }

  useEffect(() => {
    if (melSpectrogram) {
      drawMelSpectrogram(melSpectrogram)
    }
  }, [melSpectrogram])

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-xl sm:mx-auto">
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <h1 className="text-3xl font-bold text-center mb-8">Piano Transcriber</h1>
                
                {/* File Upload */}
                <div className="mb-8">
                  <input
                    type="file"
                    accept=".wav"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100"
                  />
                  <button
                    onClick={handleUpload}
                    disabled={!file || isUploading}
                    className="mt-4 w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50"
                  >
                    {isUploading ? 'Processing...' : 'Upload & Transcribe'}
                  </button>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="mb-8 p-4 bg-red-50 text-red-700 rounded-lg">
                    {error}
                  </div>
                )}

                {/* Waveform Display */}
                <div ref={waveformRef} className="w-full h-32 bg-gray-100 rounded-lg mb-8" />

                {/* Mel Spectrogram Display */}
                {melSpectrogram && (
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Mel Spectrogram</h2>
                    <div className="w-full overflow-x-auto">
                      <canvas
                        ref={canvasRef}
                        className="w-full h-64 bg-gray-100 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* Transcription Results */}
                {transcription && (
                  <div className="mt-8">
                    <h2 className="text-xl font-semibold mb-4">Transcription Results</h2>
                    <pre className="bg-gray-50 p-4 rounded-lg overflow-auto">
                      {JSON.stringify(transcription, null, 2)}
                    </pre>
                  </div>
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
