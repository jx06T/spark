export type BoothState = 0 | 1 | 2 | 3 | 4 | 5
// 0=RECORDING, 1=PROCESSING, 2=IDLE, 3=COUNTDOWN, 4=REVIEWING, 5=FINISHED

export type CaptureMode = 'instant' | 'timed' | 'manual'
export type OutputType = 'image' | 'video'

export interface BoothCapabilities {
  capture: {
    modes: CaptureMode[]
    timedDurations: number[]
  }
  output: {
    types: OutputType[]
  }
}

export interface BoothLayout {
  id: string
  label: string
  previewUrl?: string
}

export interface BoothModule {
  id: string
  name: string
  previewUrl?: string
  capabilities: BoothCapabilities
  layouts: BoothLayout[]
}

export interface BoothResult {
  localPath: string
  publicUrl: string
}

// Per-slot capture config resolved by the server
export interface ClientSlot {
  capture: CaptureMode
  timedDuration: number | null
  type: OutputType
}

export interface StatusUpdatePayload {
  state?: BoothState
  message?: string
  kept?: number
  countdown?: number
  captureMode?: CaptureMode
  timedDuration?: number | null
  capabilities?: BoothCapabilities
  modules?: BoothModule[]
  currentModule?: string
  currentLayoutId?: string
  currentFile?: string
  previewUrl?: string
  result?: BoothResult
  slots?: ClientSlot[]
}
