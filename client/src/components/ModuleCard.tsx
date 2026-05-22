import type { BoothModule } from '../types/booth'

interface Props {
  module: BoothModule
  selected: boolean
  onClick: () => void
}

export function ModuleCard({ module, selected, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl overflow-hidden border-2 transition-all text-left w-full ${
        selected
          ? 'border-pink-500 shadow-lg shadow-pink-500/20'
          : 'border-white/10 hover:border-white/30'
      }`}
    >
      <div className="aspect-video bg-gray-900 relative overflow-hidden">
        {module.previewUrl ? (
          <img
            src={module.previewUrl}
            alt={module.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs uppercase tracking-widest">
            No Preview
          </div>
        )}
        {selected && (
          <div className="absolute inset-0 bg-pink-500/10 flex items-end justify-end p-2">
            <span className="bg-pink-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
              SELECTED
            </span>
          </div>
        )}
      </div>
      <div className="p-3 bg-gray-900/90">
        <p className="font-bold text-sm text-white">{module.name}</p>
        <div className="flex gap-2 mt-1.5">
          {module.capabilities.recording && (
            <span className="text-[10px] text-gray-400 border border-gray-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
              REC
            </span>
          )}
          {module.capabilities.snapshot && (
            <span className="text-[10px] text-gray-400 border border-gray-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
              SNAP
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
