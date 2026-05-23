import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoothContext } from '../context/BoothContext'
import { ModuleCard } from '../components/ModuleCard'

export default function SelectPage() {
  const { modules, currentModule } = useBoothContext()
  const navigate = useNavigate()

  const [selectedModuleId, setSelectedModuleId] = useState(currentModule)

  useEffect(() => {
    if (currentModule && !selectedModuleId) setSelectedModuleId(currentModule)
  }, [currentModule])

  useEffect(() => {
    if (modules.length > 0 && !selectedModuleId) setSelectedModuleId(modules[0].id)
  }, [modules])

  const handleNext = () => {
    navigate('/layout', { state: { moduleId: selectedModuleId } })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-mono flex flex-col p-8 md:p-12">
      <div className="mb-10">
        <h1 className="text-pink-500 text-4xl font-black tracking-widest">CYBERBOOTH</h1>
        <p className="text-gray-600 text-xs mt-1 uppercase tracking-widest">Select a module to begin</p>
      </div>

      {modules.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-600">
            <div className="loader" />
            <p className="text-xs uppercase tracking-widest">Connecting to server...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1">
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
        </div>
      )}

      <div className="mt-10 flex justify-end">
        <button
          onClick={handleNext}
          disabled={!selectedModuleId}
          className="bg-pink-600 hover:bg-pink-500 disabled:bg-gray-800 disabled:text-gray-600 px-16 py-4 rounded-full text-xl font-bold tracking-widest transition-all"
        >
          NEXT →
        </button>
      </div>
    </div>
  )
}
