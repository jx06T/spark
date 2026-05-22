import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { useBoothContext } from '../context/BoothContext'

export default function ResultPage() {
  const { boothState, result } = useBoothContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (boothState !== 5 && !result) navigate('/', { replace: true })
  }, [])

  if (!result) return null

  const downloadUrl = result.publicUrl

  return (
    <div className="bg-slate-950 min-h-screen flex flex-col items-center justify-center text-white font-mono p-8">
      <div className="flex flex-col md:flex-row gap-12 w-full max-w-5xl items-center">
        {/* Collage image */}
        <div className="flex-1 rounded-xl overflow-hidden border border-pink-500/50 shadow-2xl shadow-pink-500/10 aspect-video">
          <img
            src={`${result.localPath}?t=${Date.now()}`}
            className="w-full h-full object-contain bg-black"
            alt="Final Collage"
          />
        </div>

        {/* QR + actions panel */}
        <div className="w-full md:w-64 flex flex-col items-center gap-6">
          <div className="text-center">
            <h2 className="text-pink-500 font-bold text-2xl tracking-widest mb-1">DONE!</h2>
            <p className="text-gray-400 text-xs uppercase tracking-tighter">Scan to download your photo</p>
          </div>

          <div className="bg-white p-3 rounded-xl shadow-lg shadow-pink-500/20">
            <QRCodeCanvas value={downloadUrl} size={200} level="H" />
          </div>

          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-500 hover:text-pink-400 break-all text-center transition-colors"
          >
            {downloadUrl}
          </a>

          <button
            onClick={() => navigate('/')}
            className="border border-white/20 hover:border-pink-500 hover:bg-pink-500/10 py-3 px-8 rounded-full text-sm transition-all w-full"
          >
            START NEW
          </button>
        </div>
      </div>
    </div>
  )
}
