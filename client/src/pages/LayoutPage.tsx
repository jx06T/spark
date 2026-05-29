import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useBoothContext } from '../context/BoothContext'

export default function LayoutPage() {
  const { modules, currentModule, currentLayoutId, startSession, setModule } = useBoothContext()
  const navigate = useNavigate()
  const location = useLocation()

  const moduleId: string = (location.state as { moduleId?: string })?.moduleId ?? currentModule
  const mod = modules.find(m => m.id === moduleId)
  const layouts = mod?.layouts ?? []

  const [selectedLayoutId, setSelectedLayoutId] = useState(() => {
    const validId = layouts.find(l => l.id === currentLayoutId)?.id
    return validId || layouts[0]?.id || ''
  })

  // 當進入頁面或 moduleId 改變時，主動通知後端切換 TD 模組
  useEffect(() => {
    console.log(currentModule,moduleId)
    if (moduleId && moduleId !== currentModule) {
      setModule(moduleId)
    }
  }, [moduleId, currentModule, setModule])

  // Sync layout default once module data loads or when module changes
  useEffect(() => {
    if (layouts.length === 0) return
    const valid = layouts.find(l => l.id === selectedLayoutId)
    if (!valid) setSelectedLayoutId(layouts[0].id)
  }, [moduleId, layouts])

  const handleStart = () => {
    startSession({ moduleId, layoutId: selectedLayoutId })
    navigate('/booth')
  }

  if (modules.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white font-mono flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="loader" />
          <p className="text-xs uppercase tracking-widest">Connecting to server...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-mono flex flex-col p-8 md:p-12">
      <div className="mb-10">
        <button
          onClick={() => navigate('/', { state: { moduleId } })}
          className="text-gray-500 hover:text-gray-400 text-xs uppercase tracking-widest transition-colors mb-4 block"
        >
          ← Back
        </button>
        <h1 className="text-pink-500 text-4xl font-black tracking-widest">{mod?.name ?? moduleId}</h1>
        <p className="text-gray-500 text-xs mt-1 uppercase tracking-widest">Select a layout</p>
      </div>

      <div className="flex-1 flex flex-col gap-10 max-w-3xl">
        {layouts.length >= 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-500 text-[10px] uppercase tracking-widest">Layout</p>
            <div className="flex gap-4 flex-wrap">
              {layouts.map(l => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLayoutId(l.id)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-2 transition-all ${
                    selectedLayoutId === l.id
                      ? 'border-pink-500 bg-pink-500/10'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  {l.previewUrl ? (
                    l.previewUrl.toLowerCase().endsWith('.mp4') ? (
                      <video
                        src={l.previewUrl}
                        className="max-h-52 max-w-32 object-contain"
                        autoPlay loop muted playsInline
                        style={{ pointerEvents: 'none' }}
                      />
                    ) : (
                      <img
                        src={l.previewUrl}
                        alt={l.label}
                        draggable={false}
                        className="max-h-52 max-w-32 object-contain"
                      />
                    )
                  ) : (
                    <div className="h-24 w-24 bg-white/5 rounded-lg flex items-center justify-center text-gray-500 text-[10px] uppercase tracking-widest">
                      {l.id}
                    </div>
                  )}
                  <span className={`text-xs uppercase tracking-wider ${
                    selectedLayoutId === l.id ? 'text-pink-400' : 'text-gray-500'
                  }`}>
                    {l.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 flex justify-end">
        <button
          onClick={handleStart}
          disabled={!selectedLayoutId}
          className="bg-pink-600 hover:bg-pink-500 disabled:bg-gray-800 disabled:text-gray-500 px-16 py-4 rounded-full text-xl font-bold tracking-widest transition-all"
        >
          START →
        </button>
      </div>
    </div>
  )
}
