export type AudioEngineStatus = 'idle' | 'ready' | 'playing' | 'paused'

export class AudioEngine {
  private status: AudioEngineStatus = 'idle'

  getStatus(): AudioEngineStatus {
    return this.status
  }

  markReady(): void {
    this.status = 'ready'
  }
}
