import type { AudioFrame } from '../audio/analyzer'
import type { AudioEngineSnapshot, AudioEngineStatus } from '../audio/audioEngine'
import { SILENT_AUDIO_FRAME } from '../audio/analyzer'

export type RuntimeTick = {
  time: number
  delta: number
  audio: AudioFrame
}

export type RuntimeSnapshot = {
  phase: 'idle' | 'running'
  activeModuleId: string | null
  nextModuleId: string | null
  transitioning: boolean
  fps: number
  audio: AudioFrame
  audioEngine: AudioEngineSnapshot
  audioStatus: AudioEngineStatus
  audioError: string | null
}

export const INITIAL_RUNTIME_SNAPSHOT: RuntimeSnapshot = {
  phase: 'idle',
  activeModuleId: null,
  nextModuleId: null,
  transitioning: false,
  fps: 0,
  audio: SILENT_AUDIO_FRAME,
  audioEngine: {
    status: 'idle',
    sourceName: null,
    currentTime: 0,
    duration: 0,
    hasSource: false,
    usingFallback: true,
  },
  audioStatus: 'idle',
  audioError: null,
}
