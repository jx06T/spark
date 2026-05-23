import { useBoothContext } from '../context/BoothContext'
import { useConfirm } from '../hooks/useConfirm'

export default function RemotePage() {
  const {
    boothState, message, kept, countdown, captureMode, capabilities,
    modules, currentModule, currentModuleLayouts, currentLayoutId,
    triggerShot, stopRecording, keepPhoto, retakePhoto, finishEarly,
    setCaptureMode, setLayout, setModule, reset,
  } = useBoothContext()
  const { confirm, modal } = useConfirm()

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
        <span>SHOTS: {kept}/4</span>
      </div>

      {/* Main action area — full screen button */}
      <div className="h-screen pt-6">
        {boothState === 0 ? (
          <button
            onClick={stopRecording}
            className="w-full h-full bg-red-600 active:bg-red-700 active:scale-[0.98] flex items-center justify-center text-5xl font-black animate-pulse transition-transform"
          >
            STOP & SAVE
          </button>
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
        ) : boothState === 1 || boothState === 5 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 text-pink-500">
            <span className="text-[15vw] animate-spin leading-none">◌</span>
            <span className="text-2xl">{boothState === 5 ? 'DONE! (Check Screen)' : 'PROCESSING...'}</span>
          </div>
        ) : (
          // state 2: IDLE
          <button
            onClick={triggerShot}
            className="w-full h-full bg-pink-600 active:bg-pink-700 active:scale-[0.98] flex items-center justify-center text-5xl font-black transition-transform"
          >
            TAKE PHOTO
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

      <div className="fixed bottom-4 left-4 z-50">
        <button onClick={handleReset} className="bg-red-900/30 px-4 py-2 rounded-full text-xs text-red-500 active:bg-red-900/50">
          RESET
        </button>
      </div>

      {modal}
    </div>
  )
}
