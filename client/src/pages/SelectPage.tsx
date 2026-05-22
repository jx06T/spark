import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoothContext } from '../context/BoothContext'
import { ModuleCard } from '../components/ModuleCard'

export default function SelectPage() {
  const { modules, currentModule, mode, capabilities, startSession } =
    useBoothContext()
  const navigate = useNavigate()

  const [selectedModuleId, setSelectedModuleId] = useState(currentModule)
  const [selectedMode, setSelectedMode] = useState<'recording' | 'snapshot'>(mode)

  // Sync selection state once initial data arrives from server
  useEffect(() => {
    if (currentModule && !selectedModuleId) setSelectedModuleId(currentModule)
  }, [currentModule])

  useEffect(() => {
    if (modules.length > 0 && !selectedModuleId) setSelectedModuleId(modules[0].id)
  }, [modules])

  const selectedModule = modules.find(m => m.id === selectedModuleId)
  const canRecord = selectedModule?.capabilities.recording ?? false
  const canSnapshot = selectedModule?.capabilities.snapshot ?? false

  // If current mode is unsupported by selected module, auto-switch
  useEffect(() => {
    if (!selectedModule) return
    if (!selectedModule.capabilities[selectedMode]) {
      setSelectedMode(canRecord ? 'recording' : 'snapshot')
    }
  }, [selectedModuleId])

  const handleStart = () => {
    startSession({ moduleId: selectedModuleId, mode: selectedMode })
    navigate('/booth')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-mono flex flex-col p-8 md:p-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-pink-500 text-4xl font-black tracking-widest">CYBERBOOTH</h1>
        <p className="text-gray-600 text-xs mt-1 uppercase tracking-widest">Select a module to begin</p>
      </div>

      {/* Module grid */}
      {modules.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-600">
            <div className="loader" />
            <p className="text-xs uppercase tracking-widest">Connecting to server...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-10">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl">
            {modules.map(mod => (
              <ModuleCard
                key={mod.id}
                module={mod}
                selected={selectedModuleId === mod.id}
                onClick={() => setSelectedModuleId(mod.id)}
              />
            ))}
          </div>

          {/* Mode selection — only shown when module supports both */}
          {selectedModule && canRecord && canSnapshot && (
            <div className="flex flex-col gap-3">
              <p className="text-gray-600 text-[10px] uppercase tracking-widest">Capture Mode</p>
              <div className="flex gap-3">
                {(
                  [
                    { value: 'recording', label: 'RECORDING' },
                    { value: 'snapshot', label: 'SNAPSHOT' },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setSelectedMode(value)}
                    className={`px-6 py-2 rounded-full text-sm border transition-all ${
                      selectedMode === value
                        ? 'border-pink-500 text-pink-400 bg-pink-500/10'
                        : 'border-white/10 text-gray-500 hover:border-white/30 hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Start button */}
      <div className="mt-10 flex justify-end">
        <button
          onClick={handleStart}
          disabled={!selectedModuleId}
          className="bg-pink-600 hover:bg-pink-500 disabled:bg-gray-800 disabled:text-gray-600 px-16 py-4 rounded-full text-xl font-bold tracking-widest transition-all"
        >
          START →
        </button>
      </div>
    </div>
  )
}
