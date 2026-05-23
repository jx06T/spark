import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useBoothContext } from '../context/BoothContext'
import type { CaptureMode } from '../types/booth'

const MODE_LABELS: Record<CaptureMode, string> = {
  instant: 'INSTANT',
  timed: 'TIMED',
  manual: 'MANUAL',
}

export default function LayoutPage() {
  const { modules, currentModule, currentLayoutId, captureMode: serverMode, timedDuration: serverDuration, startSession } =
    useBoothContext()
  const navigate = useNavigate()
  const location = useLocation()

  const moduleId: string = (location.state as { moduleId?: string })?.moduleId ?? currentModule
  const mod = modules.find(m => m.id === moduleId)

  const modes = mod?.capabilities.capture.modes ?? []
  const durations = mod?.capabilities.capture.timedDurations ?? []
  const layouts = mod?.layouts ?? []

  const [selectedLayoutId, setSelectedLayoutId] = useState(
    currentLayoutId || layouts[0]?.id || ''
  )
  const [selectedMode, setSelectedMode] = useState<CaptureMode>(
    modes.includes(serverMode) ? serverMode : (modes[0] ?? 'instant')
  )
  const [selectedDuration, setSelectedDuration] = useState<number | null>(
    serverDuration ?? durations[0] ?? null
  )

  // Sync layout default once module data loads
  useEffect(() => {
    if (!selectedLayoutId && layouts.length > 0) setSelectedLayoutId(layouts[0].id)
  }, [layouts])

  // Reset duration when mode changes away from timed
  useEffect(() => {
    if (selectedMode !== 'timed') setSelectedDuration(null)
    else if (selectedDuration === null && durations.length > 0) setSelectedDuration(durations[0])
  }, [selectedMode])

  const canStart = !!selectedLayoutId && !!selectedMode &&
    (selectedMode !== 'timed' || selectedDuration !== null)

  const handleStart = () => {
    startSession({
      moduleId,
      layoutId: selectedLayoutId,
      captureMode: selectedMode,
      timedDuration: selectedDuration ?? undefined,
    })
    navigate('/booth')
  }

  if (modules.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white font-mono flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-600">
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
          onClick={() => navigate('/')}
          className="text-gray-600 hover:text-gray-400 text-xs uppercase tracking-widest transition-colors mb-4 block"
        >
          ← Back
        </button>
        <h1 className="text-pink-500 text-4xl font-black tracking-widest">{mod?.name ?? moduleId}</h1>
        <p className="text-gray-600 text-xs mt-1 uppercase tracking-widest">Configure your session</p>
      </div>

      <div className="flex-1 flex flex-col gap-10 max-w-3xl">
        {/* Layout selection */}
        {layouts.length > 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-600 text-[10px] uppercase tracking-widest">Layout</p>
            <div className="flex gap-3 flex-wrap">
              {layouts.map(l => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLayoutId(l.id)}
                  className={`px-6 py-2 rounded-full text-sm border transition-all ${
                    selectedLayoutId === l.id
                      ? 'border-pink-500 text-pink-400 bg-pink-500/10'
                      : 'border-white/10 text-gray-500 hover:border-white/30 hover:text-gray-300'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Capture mode selection */}
        {modes.length > 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-600 text-[10px] uppercase tracking-widest">Capture Mode</p>
            <div className="flex gap-3 flex-wrap">
              {modes.map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedMode(m)}
                  className={`px-6 py-2 rounded-full text-sm border transition-all ${
                    selectedMode === m
                      ? 'border-pink-500 text-pink-400 bg-pink-500/10'
                      : 'border-white/10 text-gray-500 hover:border-white/30 hover:text-gray-300'
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timed duration selection */}
        {selectedMode === 'timed' && durations.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-600 text-[10px] uppercase tracking-widest">Duration</p>
            <div className="flex gap-3 flex-wrap">
              {durations.map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDuration(d)}
                  className={`px-6 py-2 rounded-full text-sm border transition-all ${
                    selectedDuration === d
                      ? 'border-pink-500 text-pink-400 bg-pink-500/10'
                      : 'border-white/10 text-gray-500 hover:border-white/30 hover:text-gray-300'
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 flex justify-end">
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="bg-pink-600 hover:bg-pink-500 disabled:bg-gray-800 disabled:text-gray-600 px-16 py-4 rounded-full text-xl font-bold tracking-widest transition-all"
        >
          START →
        </button>
      </div>
    </div>
  )
}
