import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoothContext } from '../context/BoothContext'
import { useConfirm } from '../hooks/useConfirm'

export default function BoothPage() {
  const {
    boothState, message, kept, countdown,
    triggerShot, stopRecording, keepPhoto, retakePhoto, finishEarly, reset,
    previewUrl,
  } = useBoothContext()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const { confirm, modal } = useConfirm()

  // Navigate to result when done
  useEffect(() => {
    if (boothState === 5) navigate('/result')
  }, [boothState, navigate])

  // Camera init
  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 } })
      .then(s => {
        stream = s
        const video = videoRef.current
        if (!video) return
        video.srcObject = s
        video.onloadedmetadata = () => {
          video.play()
          setIsCameraReady(true)
        }
        if (video.readyState >= 1) {
          video.play()
          setIsCameraReady(true)
        }
      })
      .catch(() => setCameraError(true))
    return () => stream?.getTracks().forEach(t => t.stop())
  }, [])

  const handleReset = async () => {
    const ok = await confirm('Emergency reset? All current shots will be lost.')
    if (ok) reset()
  }

  const handleGoHome = async () => {
    const ok = await confirm('Return to home? Current session will be reset.')
    if (ok) { reset(); navigate('/') }
  }

  const canTake = isCameraReady && boothState === 2

  const takeButtonLabel = () => {
    if (!isCameraReady) return 'INITIALIZING...'
    if (boothState === 3) return countdown ? `${countdown}...` : 'COUNTDOWN...'
    if (boothState === 0) return 'RECORDING...'
    if (boothState === 1) return 'PROCESSING...'
    return 'TAKE PHOTO'
  }

  return (
    <div className="bg-slate-950 h-screen flex flex-col items-center justify-center text-white font-mono p-4">
      {/* Webcam container */}
      <div className="relative w-full max-w-[990px] aspect-video bg-black overflow-hidden border border-pink-500/30 rounded-xl shadow-2xl">
        <video ref={videoRef} className="vid-webcam" autoPlay playsInline muted />

        {/* Photo preview (state 4) */}
        {boothState === 4 && previewUrl && (
          <img
            src={`${previewUrl}?t=${Date.now()}`}
            className="absolute inset-0 w-full h-full object-contain bg-black z-20"
            alt="preview"
          />
        )}

        {/* Camera loading overlay */}
        {!isCameraReady && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10">
            <div className="loader mb-4" />
            <p className="text-xs text-pink-500 uppercase tracking-widest">Initializing Stream</p>
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <p className="text-red-500 text-sm">Camera Denied</p>
          </div>
        )}

        {/* HUD overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-10">
          <div className="flex justify-between items-start">
            <div className="bg-black/50 backdrop-blur-md border border-pink-500/50 px-3 py-1 rounded text-sm">
              <span className="text-pink-400">◩ </span>{message}
            </div>
            <div className="bg-black/50 backdrop-blur-md border border-pink-500/50 px-3 py-1 rounded text-sm">
              SHOTS: <span className="text-pink-500">{kept}/4</span>
            </div>
          </div>
          {boothState === 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-red-500">RECORDING</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 w-full max-w-lg h-20 flex items-center justify-center">
        {boothState === 0 ? (
          <button
            onClick={stopRecording}
            className="bg-red-600 hover:bg-red-500 px-12 py-4 rounded-full text-xl font-bold animate-pulse"
          >
            STOP & SAVE
          </button>
        ) : boothState === 4 ? (
          <div className="flex gap-4 w-full">
            <button
              onClick={retakePhoto}
              className="flex-1 border border-gray-600 text-gray-400 py-4 rounded-xl font-bold hover:bg-gray-600 transition-all"
            >
              RETAKE
            </button>
            <button
              onClick={keepPhoto}
              className="flex-[2] border border-green-500 text-green-500 py-4 rounded-xl font-bold hover:bg-green-500 hover:text-black transition-all"
            >
              KEEP
            </button>
          </div>
        ) : boothState === 1 ? (
          <p className="text-xl text-pink-400 animate-pulse font-bold">GENERATING COLLAGE...</p>
        ) : (
          <button
            disabled={!canTake}
            onClick={triggerShot}
            className="group border border-pink-500 disabled:border-slate-700 disabled:text-slate-600 px-12 py-4 rounded-full text-xl font-bold transition-all hover:bg-pink-500 hover:text-black"
          >
            {takeButtonLabel()}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-6 w-full px-10 flex justify-between pointer-events-none">
        <div className="flex gap-4 items-center">
          {kept > 0 && boothState === 2 && (
            <button
              onClick={finishEarly}
              className="pointer-events-auto text-gray-500 hover:text-pink-400 text-[10px] uppercase tracking-widest transition-colors"
            >
              [ Finish with current shots ]
            </button>
          )}
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={handleGoHome}
            className="pointer-events-auto text-gray-500 hover:text-blue-400 text-[10px] uppercase tracking-widest transition-colors"
          >
            [ Home ]
          </button>
          <button
            onClick={handleReset}
            className="pointer-events-auto text-gray-500 hover:text-red-400 text-[10px] uppercase tracking-widest transition-colors"
          >
            [ Emergency Reset ]
          </button>
        </div>
      </div>

      {modal}
    </div>
  )
}
