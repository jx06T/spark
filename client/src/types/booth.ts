export type BoothState = 0 | 1 | 2 | 3 | 4 | 5
// 0=RECORDING, 1=PROCESSING, 2=IDLE, 3=COUNTDOWN, 4=REVIEWING, 5=FINISHED

export interface BoothLayout {
  id: string
  label: string
}

export interface BoothModule {
  id: string
  name: string
  previewUrl?: string
  capabilities: {
    recording: boolean
    snapshot: boolean
  }
  layouts: BoothLayout[]
}

export interface BoothResult {
  localPath: string
  publicUrl: string
}

export interface StatusUpdatePayload {
  state?: BoothState
  message?: string
  kept?: number
  countdown?: number
  mode?: 'recording' | 'snapshot'
  capabilities?: { recording: boolean; snapshot: boolean }
  modules?: BoothModule[]
  currentModule?: string
  currentFile?: string
  previewUrl?: string
  result?: BoothResult
}
