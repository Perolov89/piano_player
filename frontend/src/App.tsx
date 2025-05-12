import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import WaveSurfer from 'wavesurfer.js'
import './App.css'

const API_URL = 'http://localhost:8000'

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [transcription, setTranscription] = useState<any>(null)
  const [melSpectrogram, setMelSpectrogram] = useState<number[][] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Initialize WaveSurfer
  useEffect(() => {
    if (waveformRef.current && !wavesurferRef.current) {
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
      wavesurferRef.current.on('play', () => setIsPlaying(true))
      wavesurferRef.current.on('pause', () => setIsPlaying(false))
      wavesurferRef.current.on('finish', () => setIsPlaying(false))
      wavesurferRef.current.on('audioprocess', () => {
        if (wavesurferRef.current) {
          setCurrentTime(wavesurferRef.current.getCurrentTime())
        }
      })
      wavesurferRef.current.on('ready', () => {
        if (wavesurferRef.current) {
          setDuration(wavesurferRef.current.getDuration())
        }
      })
    }

    // Cleanup
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy()
        wavesurferRef.current = null
      }
    }
  }, [])

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

  const drawMelSpectrogram = (data: number[][]) => {
    const canvas = canvasRef.current
    if (!canvas) return

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

    // Convert mel spectrogram to grayscale with scaling
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < scaledWidth; j++) {
        const value = data[i][Math.floor(j / scale)]
        const idx = (i * scaledWidth + j) * 4
        
        // Grayscale colormap (black to white)
        const intensity = Math.floor(value * 255)
        pixels[idx] = intensity     // R
        pixels[idx + 1] = intensity // G
        pixels[idx + 2] = intensity // B
        pixels[idx + 3] = 255       // A
      }
    }

    // Draw the spectrogram
    ctx.putImageData(imageData, padding.left, padding.top)

    // Draw color scale
    const scaleWidth = 50
    const scaleHeight = data.length
    const gradient = ctx.createLinearGradient(
      canvas.width - padding.right + 10,
      padding.top,
      canvas.width - padding.right + 10 + scaleWidth,
      padding.top + scaleHeight
    )
    gradient.addColorStop(0, '#000000')  // Black
    gradient.addColorStop(0.5, '#808080')  // Gray
    gradient.addColorStop(1, '#FFFFFF')  // White
    
    ctx.fillStyle = gradient
    ctx.fillRect(
      canvas.width - padding.right + 10,
      padding.top,
      scaleWidth,
      scaleHeight
    )

    // Draw dB scale labels
    ctx.fillStyle = 'black'
    ctx.font = '16px Arial'
    ctx.textAlign = 'left'
    ctx.fillText('0 dB', canvas.width - padding.right + 65, padding.top)
    ctx.fillText('-80 dB', canvas.width - padding.right + 65, padding.top + scaleHeight)

    // Draw frequency scale (mel)
    ctx.textAlign = 'right'
    ctx.fillText('0 Hz', padding.left - 5, padding.top + data.length)
    ctx.fillText('8000 Hz', padding.left - 5, padding.top)

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

                {/* Waveform Display with Playback Controls */}
                {file && (
                  <div className="mb-8">
                    <div ref={waveformRef} className="w-full h-32 bg-gray-100 rounded-lg mb-2" />
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-600">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </div>
                      <div className="flex space-x-4">
                        <button
                          onClick={togglePlayPause}
                          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                        >
                          {isPlaying ? 'Pause' : 'Play'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mel Spectrogram Display */}
                {melSpectrogram && (
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Mel Spectrogram</h2>
                    <div className="w-full overflow-x-auto">
                      <canvas
                        ref={canvasRef}
                        className="w-full h-[48rem] bg-white rounded-lg"
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
