import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { io } from 'socket.io-client'
import type {
  BoothCapabilities, BoothLayout, BoothModule, BoothResult, BoothState,
  CaptureMode, ClientSlot, StatusUpdatePayload,
} from '../types/booth'

const socket = io()

const DEFAULT_CAPABILITIES: BoothCapabilities = {
  capture: { modes: ['instant'], timedDurations: [] },
  output: { types: ['image'] },
}

interface BoothContextValue {
  boothState: BoothState
  message: string
  kept: number
  countdown: number | null
  captureMode: CaptureMode
  timedDuration: number | null
  capabilities: BoothCapabilities
  modules: BoothModule[]
  currentModule: string
  currentModuleLayouts: BoothLayout[]
  currentLayoutId: string
  previewUrl: string | null
  result: BoothResult | null
  isConnected: boolean
  activeSlots: ClientSlot[]
  triggerShot: () => void
  videoStream: MediaStream | null // 將 videoStream 暴露給 Context，但不直接管理其「準備好」狀態
  isCameraStreamActive: boolean   // 表示串流是否已在 UI 中啟動並播放
  setCameraStreamActive: (active: boolean) => void // 允許 UI 更新串流活動狀態
  cameraError: boolean            // 將 cameraError 暴露給 Context
  stopRecording: () => void
  keepPhoto: () => void
  retakePhoto: () => void
  finishEarly: () => void
  setCaptureMode: (mode: CaptureMode) => void
  setTimedDuration: (duration: number) => void
  setLayout: (layoutId: string) => void
  setModule: (moduleId: string) => void
  reset: () => void
  startSession: (data?: { moduleId?: string; layoutId?: string }) => void
}

const BoothContext = createContext<BoothContextValue | null>(null)

export function BoothProvider({ children }: { children: ReactNode }) {
  const [boothState, setBoothState] = useState<BoothState>(2)
  const [message, setMessage] = useState('CONNECTING...')
  const [kept, setKept] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [captureMode, setCaptureMode_] = useState<CaptureMode>('instant')
  const [timedDuration, setTimedDuration_] = useState<number | null>(null)
  const [capabilities, setCapabilities] = useState<BoothCapabilities>(DEFAULT_CAPABILITIES)
  const [modules, setModules] = useState<BoothModule[]>([])
  const [currentModule, setCurrentModule] = useState('')
  const [currentLayoutId, setCurrentLayoutId] = useState('')
  const [currentFile, setCurrentFile] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [result, setResult] = useState<BoothResult | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  // 將相機狀態移到 Context 中
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null)
  // isCameraStreamActive 表示串流是否已在 UI 中啟動並播放
  const [isCameraStreamActive, setIsCameraStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [activeSlots, setActiveSlots] = useState<ClientSlot[]>([])

  const currentModuleLayouts = useMemo(() => {
    const mod = modules.find(m => m.id === currentModule)
    return mod?.layouts ?? []
  }, [modules, currentModule])

  useEffect(() => {
    const onConnect = () => setIsConnected(true)
    const onDisconnect = () => setIsConnected(false)
    const onStatusUpdate = (data: StatusUpdatePayload) => {
      if (data.state !== undefined) setBoothState(data.state)
      if (data.message) setMessage(data.message.toUpperCase())
      if (data.kept !== undefined) setKept(data.kept)
      setCountdown(data.countdown ?? null)
      if (data.captureMode) setCaptureMode_(data.captureMode)
      if (data.timedDuration !== undefined) setTimedDuration_(data.timedDuration ?? null)
      if (data.capabilities) setCapabilities(data.capabilities)
      if (data.modules) setModules(data.modules)
      if (data.currentModule) setCurrentModule(data.currentModule)
      if (data.currentLayoutId) setCurrentLayoutId(data.currentLayoutId)
      if (data.currentFile) setCurrentFile(data.currentFile)
      if (data.previewUrl) setPreviewUrl(data.previewUrl)
      if (data.result) setResult(data.result)
      if (data.slots) setActiveSlots(data.slots)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('status_update', onStatusUpdate)

    // 相機初始化邏輯，在 BoothProvider 掛載時執行一次
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 } })
      .then(s => {
        stream = s
        setVideoStream(s) // 將串流儲存到 Context 狀態
      })
      .catch((e) => {
        console.error("Camera access error:", e);
        setCameraError(true); // 設定相機錯誤狀態
      })

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('status_update', onStatusUpdate)
      // 在 BoothProvider 卸載時（即整個應用程式關閉或重新整理時）停止串流
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const value: BoothContextValue = {
    boothState, message, kept, countdown,
    captureMode, timedDuration, capabilities,
    modules, currentModule, currentModuleLayouts, currentLayoutId, previewUrl, result,
    isConnected, activeSlots, videoStream, isCameraStreamActive, setCameraStreamActive: setIsCameraStreamActive, cameraError, // 暴露相機狀態和更新函數
    triggerShot: () => socket.emit('trigger_shot'),
    stopRecording: () => socket.emit('user_clicked_stop'),
    keepPhoto: () => socket.emit('choice_keep', { filename: currentFile }),
    retakePhoto: () => socket.emit('choice_retake'),
    finishEarly: () => socket.emit('user_clicked_finish_early'),
    setCaptureMode: (mode) => socket.emit('set_capture_mode', { mode }),
    setTimedDuration: (duration) => socket.emit('set_timed_duration', { duration }),
    setLayout: (layoutId) => socket.emit('set_layout', { layoutId }),
    setModule: (moduleId) => socket.emit('set_module', { moduleId }),
    reset: () => socket.emit('user_clicked_reset'),
    startSession: (data) => {
      // 如果沒傳入新資料，預設使用當前已選擇的模組與佈局
      const moduleId = data?.moduleId || currentModule
      const layoutId = data?.layoutId || currentLayoutId

      setBoothState(2)
      setResult(null)
      setPreviewUrl(null) // 清除上一場的預覽，觸發 UI 進入 Initializing 狀態（如果這是預期的）
      setKept(0)
      socket.emit('user_clicked_start', { moduleId, layoutId })
    },
  }

  return <BoothContext.Provider value={value}>{children}</BoothContext.Provider>
}

export function useBoothContext() {
  const ctx = useContext(BoothContext)
  if (!ctx) throw new Error('useBoothContext must be used within BoothProvider')
  return ctx
}
