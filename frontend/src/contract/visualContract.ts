export type VisualModuleEnvelope = {
  type: 'visual_module'
  apiVersion: '1'
  moduleId: string
  targetLayer: 'foreground'
  duration: number
  transitionSeconds: number
  code: string
}

export type VisualFrame = {
  time: number
  delta: number
  progress: number
  audio: {
    energy: number
    bassEnergy: number
    midEnergy: number
    highEnergy: number
    beat: boolean
    beatStrength: number
    bpm: number
  }
  transition: {
    in: number
    out: number
  }
}
