import { useEffect, useState } from 'react'
import { useBoothContext } from '../context/BoothContext'
import { useConfirm } from '../hooks/useConfirm'

export default function RemotePage() {
  const {
    boothState, message, kept, countdown, captureMode, capabilities,
    modules, currentModule, currentModuleLayouts, currentLayoutId,
    triggerShot, stopRecording, keepPhoto, retakePhoto, finishEarly, startSession,
    setCaptureMode, setLayout, setModule, reset, activeSlots,
  } = useBoothContext()
  const { confirm, modal } = useConfirm()
  const [recordingTimeLeft, setRecordingTimeLeft] = useState<number | null>(null)

  const totalSlots = activeSlots.length || 4
  const nextSlot = activeSlots[kept]

  // 處理定時錄影倒數邏輯
  useEffect(() => {
    if (boothState !== 0 || nextSlot?.capture !== 'timed' || !nextSlot.timedDuration) {
      setRecordingTimeLeft(null)
      return
    }
    setRecordingTimeLeft(nextSlot.timedDuration)
    const interval = setInterval(() => {
      setRecordingTimeLeft(prev => (prev !== null && prev > 1 ? prev - 1 : null))
    }, 1000)
    return () => clearInterval(interval)
  }, [boothState, kept])

  const handleReset = async () => {
    const ok = await confirm('Reset session? All current shots will be lost.')
    if (ok) reset()
  }

  const handleLayout = () => {
    if (currentModuleLayouts.length < 2) return
    const idx = currentModuleLayouts.findIndex(l => l.id === currentLayoutId)
    const next = currentModuleLayouts[(idx + 1) % currentModuleLayouts.length]
    setLayout(next.id)
  }

  const handleModule = () => {
    if (modules.length < 2) return
    const idx = modules.findIndex(m => m.id === currentModule)
    const next = modules[(idx + 1) % modules.length]
    setModule(next.id)
  }

  const nextSlotLabel = () => {
    if (!nextSlot) return 'TAKE PHOTO'
    if (nextSlot.capture === 'instant') return nextSlot.type === 'video' ? 'CAPTURE FRAME' : 'TAKE PHOTO'
    if (nextSlot.capture === 'timed') return `RECORD ${nextSlot.timedDuration}s VIDEO`
    return 'START RECORDING'
  }

  const currentMod = modules.find(m => m.id === currentModule)
  const currentLayout = currentModuleLayouts.find(l => l.id === currentLayoutId)

  return (
    <div
      className="bg-slate-950 text-white font-mono overflow-hidden h-screen"
      style={{ touchAction: 'manipulation' }}
    >
      {/* Status bar */}
      <div className="fixed top-0 left-0 w-full bg-pink-600 text-[10px] py-1 px-4 flex justify-between z-50">
        <span>{message}</span>
        <span>SHOTS: {kept}/{totalSlots}</span>
      </div>

      {/* Main action area — full screen button */}
      <div className="h-screen pt-6">
        {boothState === 0 ? (
          nextSlot?.capture === 'timed' ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <span className="text-[30vw] font-black text-red-500 tabular-nums leading-none">
                {recordingTimeLeft ?? nextSlot.timedDuration}
              </span>
              <span className="text-2xl font-black text-red-600 animate-pulse tracking-widest">RECORDING</span>
            </div>
          ) : (
            <button
              onClick={stopRecording}
              className="w-full h-full bg-red-600 active:bg-red-700 active:scale-[0.98] flex items-center justify-center text-5xl font-black animate-pulse transition-transform"
            >
              STOP & SAVE
            </button>
          )
        ) : boothState === 4 ? (
          <div className="flex w-full h-full">
            <button
              onClick={retakePhoto}
              className="flex-1 bg-gray-800 border-r border-gray-700 active:scale-[0.98] flex items-center justify-center text-3xl font-black text-gray-400 transition-transform"
            >
              RETAKE
            </button>
            <button
              onClick={keepPhoto}
              className="flex-[2] bg-green-600 active:bg-green-700 active:scale-[0.98] flex items-center justify-center text-3xl font-black transition-transform"
            >
              KEEP
            </button>
          </div>
        ) : boothState === 3 ? (
          <div className="w-full h-full flex items-center justify-center text-[20vw] font-black">
            {countdown ?? ''}
          </div>
        ) : boothState === 1 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 text-pink-500">
            <span className="text-[15vw] animate-spin leading-none">◌</span>
            <span className="text-2xl font-bold">
              {kept >= totalSlots - 1 ? 'GENERATING COLLAGE...' : 'PROCESSING...'}
            </span>
          </div>
        ) : boothState === 5 ? ( // DONE state
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-pink-500 px-6">
            <div className="text-center">
              <h2 className="text-6xl font-black mb-2 leading-none">DONE!</h2>
              <p className="text-gray-400 uppercase tracking-widest">(Check the main screen)</p>
            </div>
          </div>
        ) : (
          // state 2: IDLE
          <button
            onClick={triggerShot}
            className="w-full h-full bg-pink-600 active:bg-pink-700 active:scale-[0.98] flex items-center justify-center text-5xl font-black transition-transform"
          >
            {nextSlotLabel()}
          </button>
        )}
      </div>

      {/* Footer buttons */}
      {boothState === 2 && (
        <div className="fixed bottom-4 right-4 flex gap-3 z-50 flex-wrap justify-end">
          {kept > 0 && (
            <button onClick={finishEarly} className="bg-white/10 px-4 py-2 rounded-full text-xs active:bg-white/20">
              FINISH EARLY
            </button>
          )}
          {capabilities.capture.modes.length > 1 && (
            <button
              onClick={() => {
                const modes = capabilities.capture.modes
                const next = modes[(modes.indexOf(captureMode) + 1) % modes.length]
                setCaptureMode(next)
              }}
              className="bg-white/10 px-4 py-2 rounded-full text-xs active:bg-white/20"
            >
              {captureMode.toUpperCase()}
            </button>
          )}
          {currentModuleLayouts.length >= 1 && (
            <button onClick={handleLayout} className="bg-white/10 px-4 py-2 rounded-full text-xs active:bg-white/20">
              {currentLayout?.label.toUpperCase() ?? 'LAYOUT'}
            </button>
          )}
          {modules.length >= 1 && (
            <button onClick={handleModule} className="bg-white/10 px-4 py-2 rounded-full text-xs active:bg-white/20">
              {currentMod?.name.toUpperCase() ?? 'MODULE'}
            </button>
          )}
        </div>
      )}

      {/* Bottom right: Start New (only when Done) */}
      {boothState === 5 && (
        <div className="fixed bottom-4 right-4 z-50">
          <button 
            onClick={() => startSession()} 
            className="bg-pink-600 px-6 py-3 rounded-full text-sm font-black text-white active:scale-95 transition-transform shadow-lg shadow-pink-600/40 uppercase tracking-widest"
          >
            Start New
          </button>
        </div>
      )}

      <div className="fixed bottom-4 left-4 z-50">
        <button onClick={handleReset} className="bg-red-900/30 px-4 py-2 rounded-full text-xs text-red-500 active:bg-red-900/50">
          RESET
        </button>
      </div>

      {modal}
    </div>
  )
}
