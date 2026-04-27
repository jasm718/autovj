import {
  SILENT_AUDIO_FRAME,
  analyzeAudioFrame,
  createDemoAudioFrame,
  createDemoMusicWindowSummary,
  summarizeMusicWindow,
  trimAnalysisHistory,
  type AnalysisHistorySample,
  type AudioFrame,
  type MusicWindowSummary,
} from './analyzer'

export type AudioEngineStatus = 'idle' | 'ready' | 'loading' | 'playing' | 'paused' | 'error'

export type AudioEngineSnapshot = {
  status: AudioEngineStatus
  sourceName: string | null
  currentTime: number
  duration: number
  hasSource: boolean
  usingFallback: boolean
}

const FFT_SIZE = 2048
const SMOOTHING = 0.76

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export class AudioEngine {
  private status: AudioEngineStatus = 'idle'
  private readonly audioElement = new Audio()
  private currentObjectUrl: string | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private analyserNode: AnalyserNode | null = null
  private frequencyData = new Uint8Array(0)
  private timeDomainData = new Uint8Array(0)
  private analysisHistory: AnalysisHistorySample[] = []
  private beatTimes: number[] = []
  private energyHistory: number[] = []
  private lastBeatTime = -Infinity
  private lastFrame: AudioFrame = SILENT_AUDIO_FRAME
  private lastErrorMessage: string | null = null
  private sourceName: string | null = null
  private usingFallback = true

  constructor() {
    this.audioElement.preload = 'auto'
    this.audioElement.crossOrigin = 'anonymous'

    this.audioElement.addEventListener('ended', () => {
      this.status = 'paused'
    })

    this.audioElement.addEventListener('pause', () => {
      if (this.status !== 'loading' && this.status !== 'error') {
        this.status = 'paused'
      }
    })

    this.audioElement.addEventListener('play', () => {
      this.status = 'playing'
    })
  }

  getStatus(): AudioEngineStatus {
    return this.status
  }

  getLastError(): string | null {
    return this.lastErrorMessage
  }

  getSnapshot(): AudioEngineSnapshot {
    return {
      status: this.status,
      sourceName: this.sourceName,
      currentTime: this.audioElement.currentTime || 0,
      duration: Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : 0,
      hasSource: this.sourceName !== null,
      usingFallback: this.usingFallback,
    }
  }

  markReady(): void {
    if (this.status === 'idle') {
      this.status = 'ready'
    }
  }

  async loadFile(file: File): Promise<void> {
    this.status = 'loading'
    this.lastErrorMessage = null

    try {
      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl)
      }

      const objectUrl = URL.createObjectURL(file)
      this.currentObjectUrl = objectUrl
      this.audioElement.src = objectUrl
      this.audioElement.currentTime = 0
      this.sourceName = file.name
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          this.audioElement.removeEventListener('loadeddata', onLoaded)
          this.audioElement.removeEventListener('error', onError)
          resolve()
        }
        const onError = () => {
          this.audioElement.removeEventListener('loadeddata', onLoaded)
          this.audioElement.removeEventListener('error', onError)
          reject(new Error('failed to decode selected audio file'))
        }

        this.audioElement.addEventListener('loadeddata', onLoaded, { once: true })
        this.audioElement.addEventListener('error', onError, { once: true })
        this.audioElement.load()
      })

      this.resetAnalysisState()
      this.usingFallback = false
      this.status = 'ready'
    } catch (error) {
      this.lastErrorMessage = error instanceof Error ? error.message : String(error)
      this.status = 'error'
      throw error
    }
  }

  async play(): Promise<void> {
    try {
      await this.ensureContext()
      await this.audioElement.play()
      this.status = 'playing'
      this.usingFallback = false
    } catch (error) {
      this.lastErrorMessage = error instanceof Error ? error.message : String(error)
      this.status = 'error'
      throw error
    }
  }

  pause(): void {
    if (!this.audioElement.paused) {
      this.audioElement.pause()
    }
    if (this.status !== 'error') {
      this.status = 'paused'
    }
  }

  useFallbackPlayback(): void {
    this.pause()
    this.sourceName = null
    this.lastErrorMessage = null
    this.resetAnalysisState()
    this.usingFallback = true
    this.status = 'playing'
  }

  async resumeContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
  }

  getFrame(time: number): AudioFrame {
    if (this.status !== 'playing') {
      return this.usingFallback ? createDemoAudioFrame(time) : SILENT_AUDIO_FRAME
    }

    if (this.usingFallback || !this.analyserNode || !this.audioContext) {
      this.lastFrame = createDemoAudioFrame(time)
      return this.lastFrame
    }

    this.analyserNode.getByteFrequencyData(this.frequencyData)
    this.analyserNode.getByteTimeDomainData(this.timeDomainData)

    const result = analyzeAudioFrame({
      frequencyData: this.frequencyData,
      timeDomainData: this.timeDomainData,
      sampleRate: this.audioContext.sampleRate,
      fftSize: this.analyserNode.fftSize,
      now: this.audioElement.currentTime || time,
      energyHistory: this.energyHistory,
      beatTimes: this.beatTimes,
      lastBeatTime: this.lastBeatTime,
    })

    this.energyHistory.push(result.energy)
    if (this.energyHistory.length > 90) {
      this.energyHistory.shift()
    }

    const sampleTime = this.audioElement.currentTime || time
    if (result.beat) {
      this.lastBeatTime = sampleTime
      this.beatTimes.push(sampleTime)
      this.beatTimes = this.beatTimes.filter((beatTime) => sampleTime - beatTime <= 30)
    }

    this.analysisHistory.push({
      time: sampleTime,
      energy: result.energy,
      bassEnergy: result.bassEnergy,
      midEnergy: result.midEnergy,
      highEnergy: result.highEnergy,
      beatStrength: result.beatStrength,
      beat: result.beat,
    })
    this.analysisHistory = trimAnalysisHistory(this.analysisHistory, sampleTime)

    this.lastFrame = {
      energy: result.energy,
      bassEnergy: result.bassEnergy,
      midEnergy: result.midEnergy,
      highEnergy: result.highEnergy,
      beat: result.beat,
      beatStrength: result.beatStrength,
      bpm: result.bpm,
    }

    return this.lastFrame
  }

  getWindowSummary(time: number, windowSeconds = 30): MusicWindowSummary {
    if (this.usingFallback) {
      return createDemoMusicWindowSummary(time, windowSeconds)
    }

    if (this.analysisHistory.length === 0) {
      return {
        ...SILENT_AUDIO_FRAME,
        windowSeconds,
        beatDensity: 0,
        moodHint: this.usingFallback ? 'demo' : 'idle',
      }
    }

    return summarizeMusicWindow(this.analysisHistory, this.lastFrame.bpm, windowSeconds, this.audioElement.currentTime || time)
  }

  private async ensureContext(): Promise<void> {
    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) {
        throw new Error('Web Audio API is unavailable in this browser')
      }

      this.audioContext = new AudioContextCtor()
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = FFT_SIZE
      this.analyserNode.smoothingTimeConstant = SMOOTHING
      this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount)
      this.timeDomainData = new Uint8Array(this.analyserNode.fftSize)
    }

    if (!this.sourceNode) {
      if (!this.analyserNode || !this.audioContext) {
        throw new Error('audio analyser is unavailable')
      }

      this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement)
      this.sourceNode.connect(this.analyserNode)
      this.analyserNode.connect(this.audioContext.destination)
    }

    await this.resumeContext()
  }

  private resetAnalysisState(): void {
    this.analysisHistory = []
    this.beatTimes = []
    this.energyHistory = []
    this.lastBeatTime = -Infinity
    this.lastFrame = SILENT_AUDIO_FRAME
  }
}
