interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
        <p className="text-white text-center mb-8 font-mono text-sm leading-relaxed">{message}</p>
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 border border-white/20 py-3 rounded-full text-gray-400 hover:text-white hover:border-white/40 transition-all font-mono text-sm"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-full text-white font-bold transition-all font-mono text-sm"
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  )
}
