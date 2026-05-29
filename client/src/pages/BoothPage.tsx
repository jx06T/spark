import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoothContext } from '../context/BoothContext'
import { useConfirm } from '../hooks/useConfirm'

export default function BoothPage() {
  const {
    boothState, message, kept, countdown,
    triggerShot, stopRecording, keepPhoto, retakePhoto, finishEarly, reset,
    previewUrl, activeSlots, videoStream, isCameraStreamActive, setCameraStreamActive, cameraError, // 從 Context 獲取相機狀態和更新函數
  } = useBoothContext()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [recordingTimeLeft, setRecordingTimeLeft] = useState<number | null>(null) // 保持本地狀態
  const { confirm, modal } = useConfirm() // 保持本地狀態

  // Navigate to result when done
  useEffect(() => {
    if (boothState === 5) navigate('/result')
  }, [boothState, navigate])

  // 當 video 元素和 videoStream 都準備好時，將串流賦予 video 元素
  useEffect(() => {
    const video = videoRef.current
    if (video && videoStream) {
      video.srcObject = videoStream
      // 確保影片自動播放，即使元數據已經載入
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setCameraStreamActive(true); // 播放成功，更新 Context 狀態
        }).catch(e => {
          console.error("Error playing video stream:", e);
          setCameraStreamActive(false); // 播放失敗，更新 Context 狀態
        });
      }
    }
    // 清理函數：當 videoStream 改變或組件卸載時，將相機串流狀態設為非活動
    return () => setCameraStreamActive(false);
  }, [videoStream, setCameraStreamActive]) // 依賴於 Context 中的 videoStream 和 setCameraStreamActive

  const handleReset = async () => {
    const ok = await confirm('Emergency reset? All current shots will be lost.')
    if (ok) reset()
  }

  const handleGoBack = async () => {
    const ok = await confirm('Return to setup? Current session will be reset.')
    if (ok) { reset(); navigate('/layout') }
  }

  const totalSlots = activeSlots.length || 4
  const nextSlot = activeSlots[kept]
  const currentSlot = activeSlots[Math.max(0, kept - 1)]
  
  // Timed recording countdown
  useEffect(() => {
    if (boothState !== 0 || nextSlot?.capture !== 'timed' || !nextSlot.timedDuration) {
      setRecordingTimeLeft(null)
      return
    }
    setRecordingTimeLeft(nextSlot.timedDuration)
    const interval = setInterval(() => {
      setRecordingTimeLeft(prev => (prev !== null && prev > 1 ? prev - 1 : null))
    }, 1000)
    return () => clearInterval(interval) // 清理計時器
  }, [boothState, kept])

  const nextSlotLabel = () => {
    if (!nextSlot) return 'TAKE PHOTO'
    if (nextSlot.capture === 'instant') return nextSlot.type === 'video' ? 'CAPTURE FRAME' : 'TAKE PHOTO'
    if (nextSlot.capture === 'timed') return `RECORD ${nextSlot.timedDuration}s VIDEO`
    return 'START RECORDING'
  }

  const canTake = isCameraStreamActive && boothState === 2

  const takeButtonLabel = () => {
    if (!isCameraStreamActive) return 'INITIALIZING...'
    if (boothState === 3) return '...'
    if (boothState === 0) return 'RECORDING...'
    if (boothState === 1) return 'PROCESSING...'
    return nextSlotLabel()
  }

  const isVideoPreview = boothState === 4 && nextSlot === undefined
    ? currentSlot?.type === 'video'
    : activeSlots[kept]?.type === 'video'

  return (
    <div className="bg-slate-950 h-screen flex flex-col items-center justify-center text-white font-mono p-4">
      {/* Webcam container */}
      <div className="relative w-full max-w-247.5 aspect-video bg-black overflow-hidden border border-pink-500/30 rounded-xl shadow-2xl">
        <video ref={videoRef} className="vid-webcam" autoPlay playsInline muted />

        {/* Photo preview (state 4) */}
        {boothState === 4 && previewUrl && (
          isVideoPreview ? (
            <video
              key={previewUrl}
              src={`${previewUrl}?t=${Date.now()}`}
              className="absolute inset-0 w-full h-full object-contain bg-black z-20"
              autoPlay loop muted playsInline
            />
          ) : (
            <img
              src={`${previewUrl}?t=${Date.now()}`}
              className="absolute inset-0 w-full h-full object-contain bg-black z-20"
              alt="preview"
            />
          )
        )}

        {/* Camera loading overlay */}
        {!isCameraStreamActive && !cameraError && (
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

        {/* Countdown overlay — large floating number */}
        {boothState === 3 && countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <span
              className="font-black text-white/80 select-none leading-none"
              style={{ fontSize: '25vw', textShadow: '0 0 80px rgba(236,72,153,0.9), 0 0 20px rgba(236,72,153,0.6)' }}
            >
              {countdown}
            </span>
          </div>
        )}

        {/* HUD overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-10">
          <div className="flex justify-between items-start">
            <div className="bg-black/50 backdrop-blur-md border border-pink-500/50 px-3 py-1 rounded text-sm">
              <span className="text-pink-400">◩ </span>{message}
            </div>
            <div className="bg-black/50 backdrop-blur-md border border-pink-500/50 px-3 py-1 rounded text-sm flex items-center gap-2">
              SHOTS: <span className="text-pink-500">{kept}/{totalSlots}</span>
              {boothState === 2 && nextSlot && (
                <span className="text-gray-400 text-xs border-l border-white/20 pl-2">
                  {nextSlot.type === 'video'
                    ? (nextSlot.capture === 'timed' ? `${nextSlot.timedDuration}s VIDEO` : 'VIDEO')
                    : 'PHOTO'}
                </span>
              )}
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
          nextSlot?.capture === 'timed' ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl font-black text-red-400 tabular-nums">
                {recordingTimeLeft ?? nextSlot.timedDuration}s
              </span>
              <span className="text-[10px] uppercase tracking-widest text-red-600">Recording</span>
            </div>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-red-600 hover:bg-red-500 px-12 py-4 rounded-full text-xl font-bold animate-pulse"
            >
              STOP & SAVE
            </button>
          )
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
              className="flex-2 border border-green-500 text-green-500 py-4 rounded-xl font-bold hover:bg-green-500 hover:text-black transition-all"
            >
              KEEP
            </button>
          </div>
        ) : boothState === 1 ? (
          <p className="text-xl text-pink-400 animate-pulse font-bold">
            {kept >= totalSlots - 1 ? 'GENERATING COLLAGE...' : 'PROCESSING...'}
          </p>
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
            onClick={handleGoBack}
            className="pointer-events-auto text-gray-500 hover:text-blue-400 text-[10px] uppercase tracking-widest transition-colors"
          >
            [ ← Setup ]
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
