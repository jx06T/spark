import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { useBoothContext } from '../context/BoothContext'

// 建議將此位址放入 .env 檔案中，例如 VITE_API_BASE_URL
// 開發環境通常需要加 localhost:5000，正式環境 (同網域) 則留空
const API_BASE_URL = (import.meta as any).env?.DEV ? 'http://localhost:5000' : ''

export default function ResultPage() {
  const { boothState, result, startSession } = useBoothContext()
  const navigate = useNavigate()

  // 優先從 Context 獲取，若無則嘗試從本地緩存恢復
  const finalResult = useMemo(() => {
    if (result) {
      // 當有新結果時，同步更新緩存
      localStorage.setItem('last_booth_result', JSON.stringify(result))
      return result
    }
    const saved = localStorage.getItem('last_booth_result')
    return saved ? JSON.parse(saved) : null
  }, [result])

  const handleStartNew = () => {
    localStorage.removeItem('last_booth_result') // 清除舊結果
    startSession()
    navigate('/booth')
  }

  useEffect(() => {
    // 如果 Context 顯示不是結果狀態，且本地也沒有緩存，才跳轉
    // 增加一個延遲或檢查機制，確保 Socket 連線恢復中不會誤判
    if (boothState !== 5 && !localStorage.getItem('last_booth_result')) {
      navigate('/', { replace: true })
    }
  }, [boothState, navigate])

  if (!finalResult) return null

  const downloadUrl = finalResult.publicUrl
  const imageSrc = finalResult.localPath.startsWith('http') 
    ? finalResult.localPath 
    : `${API_BASE_URL}${finalResult.localPath}`

  return (
    <div className="bg-slate-950 min-h-screen flex flex-col items-center justify-center text-white font-mono p-8">
      <div className="flex flex-col md:flex-row gap-12 w-full max-w-5xl items-center">
        {/* Collage image */}
        <div className="flex-1 rounded-xl overflow-hidden border border-pink-500/50 shadow-2xl shadow-pink-500/10 aspect-video">
          <img
            src={`${imageSrc}${imageSrc.includes('?') ? '&' : '?'}t=${Date.now()}`}
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
            onClick={handleStartNew}
            className="border border-white/20 hover:border-pink-500 hover:bg-pink-500/10 py-3 px-8 rounded-full text-sm transition-all w-full"
          >
            START NEW
          </button>
        </div>
      </div>
    </div>
  )
}
