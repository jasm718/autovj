export type AudioFrame = {
  energy: number
  bassEnergy: number
  midEnergy: number
  highEnergy: number
  beat: boolean
  beatStrength: number
  bpm: number
}

export type MusicWindowSummary = AudioFrame & {
  windowSeconds: number
  beatDensity: number
  moodHint: string
}

export const SILENT_AUDIO_FRAME: AudioFrame = {
  energy: 0,
  bassEnergy: 0,
  midEnergy: 0,
  highEnergy: 0,
  beat: false,
  beatStrength: 0,
  bpm: 0,
}
