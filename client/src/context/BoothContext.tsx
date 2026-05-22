import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { io } from 'socket.io-client'
import type { BoothLayout, BoothModule, BoothResult, BoothState, StatusUpdatePayload } from '../types/booth'

const socket = io()

interface BoothContextValue {
  boothState: BoothState
  message: string
  kept: number
  countdown: number | null
  mode: 'recording' | 'snapshot'
  capabilities: { recording: boolean; snapshot: boolean }
  modules: BoothModule[]
  currentModule: string
  currentModuleLayouts: BoothLayout[]
  currentLayoutId: string
  previewUrl: string | null
  result: BoothResult | null
  isConnected: boolean
  triggerShot: () => void
  stopRecording: () => void
  keepPhoto: () => void
  retakePhoto: () => void
  finishEarly: () => void
  setCaptureMode: (mode: 'recording' | 'snapshot') => void
  setLayout: (layoutId: string) => void
  setModule: (moduleId: string) => void
  reset: () => void
  startSession: (data?: { moduleId?: string; mode?: 'recording' | 'snapshot' }) => void
}

const BoothContext = createContext<BoothContextValue | null>(null)

export function BoothProvider({ children }: { children: ReactNode }) {
  const [boothState, setBoothState] = useState<BoothState>(2)
  const [message, setMessage] = useState('CONNECTING...')
  const [kept, setKept] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [mode, setMode] = useState<'recording' | 'snapshot'>('recording')
  const [capabilities, setCapabilities] = useState({ recording: false, snapshot: false })
  const [modules, setModules] = useState<BoothModule[]>([])
  const [currentModule, setCurrentModule] = useState('')
  const [currentLayoutId, setCurrentLayoutId] = useState('')
  const [currentFile, setCurrentFile] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [result, setResult] = useState<BoothResult | null>(null)
  const [isConnected, setIsConnected] = useState(false)

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
      if (data.mode) setMode(data.mode)
      if (data.capabilities) setCapabilities(data.capabilities)
      if (data.modules) setModules(data.modules)
      if (data.currentModule) setCurrentModule(data.currentModule)
      if (data.message?.startsWith('Layout:')) {
        setCurrentLayoutId(data.message.replace('Layout:', '').trim())
      }
      if (data.currentFile) setCurrentFile(data.currentFile)
      if (data.previewUrl) setPreviewUrl(data.previewUrl)
      if (data.result) setResult(data.result)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('status_update', onStatusUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('status_update', onStatusUpdate)
    }
  }, [])

  const value: BoothContextValue = {
    boothState, message, kept, countdown, mode, capabilities,
    modules, currentModule, currentModuleLayouts, currentLayoutId,
    previewUrl, result, isConnected,
    triggerShot: () => socket.emit('trigger_shot'),
    stopRecording: () => socket.emit('user_clicked_stop'),
    keepPhoto: () => socket.emit('choice_keep', { filename: currentFile }),
    retakePhoto: () => socket.emit('choice_retake'),
    finishEarly: () => socket.emit('user_clicked_finish_early'),
    setCaptureMode: (m) => socket.emit('set_capture_mode', { mode: m }),
    setLayout: (layoutId) => socket.emit('set_layout', { layoutId }),
    setModule: (moduleId) => socket.emit('set_module', { moduleId }),
    reset: () => socket.emit('user_clicked_reset'),
    startSession: (data) => socket.emit('user_clicked_start', data ?? {}),
  }

  return <BoothContext.Provider value={value}>{children}</BoothContext.Provider>
}

export function useBoothContext() {
  const ctx = useContext(BoothContext)
  if (!ctx) throw new Error('useBoothContext must be used within BoothProvider')
  return ctx
}
