import { AudioEngine } from '../audio/audioEngine'
import { SILENT_AUDIO_FRAME, type AudioFrame, type MusicWindowSummary } from '../audio/analyzer'
import { P5Layer } from './background/p5Layer'
import { ThreeLayer } from './foreground/threeLayer'
import type { VisualModuleProgram } from './moduleTypes'
import { INITIAL_RUNTIME_SNAPSHOT, type RuntimeSnapshot } from './runtimeTypes'

type VisualRuntimeOptions = {
  onStateChange?: (snapshot: RuntimeSnapshot) => void
}

export class VisualRuntime {
  private readonly background: P5Layer
  private readonly foreground: ThreeLayer
  private readonly audioEngine = new AudioEngine()
  private readonly onStateChange?: (snapshot: RuntimeSnapshot) => void
  private resizeObserver: ResizeObserver | null = null
  private frameHandle: number | null = null
  private lastFrameTime = 0
  private lastPublishTime = 0
  private lastSnapshot: RuntimeSnapshot = INITIAL_RUNTIME_SNAPSHOT
  private mounted = false

  constructor(
    private readonly container: HTMLElement,
    options: VisualRuntimeOptions = {},
  ) {
    this.background = new P5Layer(container)
    this.foreground = new ThreeLayer(container)
    this.onStateChange = options.onStateChange
  }

  mount(): void {
    if (this.mounted) {
      throw new Error('runtime is already mounted')
    }

    this.background.mount()
    this.foreground.mount()
    this.audioEngine.markReady()
    this.audioEngine.useFallbackPlayback()
    this.mounted = true

    this.resizeToContainer()
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeToContainer()
    })
    this.resizeObserver.observe(this.container)

    this.publishState(INITIAL_RUNTIME_SNAPSHOT)
    this.frameHandle = window.requestAnimationFrame(this.tick)
  }

  unmount(): void {
    this.mounted = false

    if (this.frameHandle !== null) {
      window.cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    }

    this.resizeObserver?.disconnect()
    this.resizeObserver = null

    this.foreground.unmount()
    this.background.setRenderer()
    this.background.unmount()
    this.audioEngine.pause()
    this.publishState(INITIAL_RUNTIME_SNAPSHOT)
  }

  queueProgram(program: VisualModuleProgram): boolean {
    return this.foreground.queueProgram(program)
  }

  getWindowSummary(windowSeconds = 30): MusicWindowSummary {
    const time = this.lastFrameTime === 0 ? performance.now() / 1000 : this.lastFrameTime / 1000
    return this.audioEngine.getWindowSummary(time, windowSeconds)
  }

  async loadAudioFile(file: File): Promise<void> {
    await this.audioEngine.loadFile(file)
    this.publishAudioSnapshot()
  }

  async playAudio(): Promise<void> {
    await this.audioEngine.play()
    this.publishAudioSnapshot()
  }

  pauseAudio(): void {
    this.audioEngine.pause()
    this.publishAudioSnapshot()
  }

  useFallbackAudio(): void {
    this.audioEngine.useFallbackPlayback()
    this.publishAudioSnapshot()
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.mounted) {
      return
    }

    const time = timestamp / 1000
    const delta = this.lastFrameTime === 0 ? 1 / 60 : Math.min(0.05, (timestamp - this.lastFrameTime) / 1000)
    this.lastFrameTime = timestamp

    const audio = this.audioEngine.getFrame(time)
    const tick = { time, delta, audio }
    const state = this.foreground.render(tick)
    this.background.setRenderer(state.backgroundRenderer ?? undefined)
    this.background.render(this.createVisualFrame(time, delta, audio))

    if (timestamp - this.lastPublishTime >= 120) {
      this.lastPublishTime = timestamp
      this.publishState({
        phase: 'running',
        activeModuleId: state.activeModuleId,
        nextModuleId: state.nextModuleId,
        transitioning: state.transitioning,
        fps: Math.round(1 / Math.max(delta, 0.0001)),
        audio,
        audioEngine: this.audioEngine.getSnapshot(),
        audioStatus: this.audioEngine.getStatus(),
        audioError: this.audioEngine.getLastError(),
      })
    }

    this.frameHandle = window.requestAnimationFrame(this.tick)
  }

  private resizeToContainer(): void {
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))

    this.background.resize(width, height)
    this.foreground.resize(width, height)
  }

  private publishState(snapshot: RuntimeSnapshot): void {
    this.lastSnapshot = snapshot
    this.onStateChange?.(snapshot)
  }

  private publishAudioSnapshot(): void {
    this.publishState({
      ...this.lastSnapshot,
      phase: this.mounted ? 'running' : 'idle',
      audio: this.lastFrameTime === 0 ? SILENT_AUDIO_FRAME : this.audioEngine.getFrame(this.lastFrameTime / 1000),
      audioEngine: this.audioEngine.getSnapshot(),
      audioStatus: this.audioEngine.getStatus(),
      audioError: this.audioEngine.getLastError(),
    })
  }

  private createVisualFrame(time: number, delta: number, audio: AudioFrame) {
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))

    return {
      time,
      delta,
      progress: 0,
      audio,
      transition: {
        in: 1,
        out: 0,
      },
      viewport: {
        width,
        height,
        aspect: width / height,
      },
    }
  }
}
