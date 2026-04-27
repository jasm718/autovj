import type { SocketClientHandlers, SocketMessage } from './socket'

const SOCKET_OPEN_READY_STATE = 1
const SOCKET_CLOSED_READY_STATE = 3
const DEFAULT_RETRY_DELAY_MS = 2_000

type SocketLike = Pick<WebSocket, 'readyState' | 'send' | 'close'>

export type BackendTimelineLabel = 'connect' | 'socket' | 'send' | 'recv' | 'retry' | 'agent'

export type BackendTimelineEntry = {
  id: number
  createdAt: number
  label: BackendTimelineLabel
  message: string
}

type BackendConnectionOptions = {
  connect: (handlers: SocketClientHandlers) => SocketLike
  retryDelayMs?: number
  onStatusChange?: (status: string) => void
  onTimelineEntry?: (entry: BackendTimelineEntry) => void
  onDisconnected?: () => void
  onReady?: () => void
  onVisualModule?: (message: SocketMessage) => void
  onAgentError?: (message: string) => void
}

export class BackendConnection {
  private readonly retryDelayMs: number
  private socket: SocketLike | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  private backendReady = false
  private nextTimelineId = 1

  constructor(private readonly options: BackendConnectionOptions) {
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  }

  start(): void {
    if (!this.stopped) {
      return
    }

    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    this.backendReady = false
    this.clearRetryTimer()

    const socket = this.socket
    this.socket = null

    if (socket && socket.readyState !== SOCKET_CLOSED_READY_STATE) {
      socket.close()
    }
  }

  requestMusicWindow(payload: unknown): boolean {
    if (!this.backendReady || !this.socket || this.socket.readyState !== SOCKET_OPEN_READY_STATE) {
      return false
    }

    this.socket.send(
      JSON.stringify({
        type: 'music_window',
        payload,
      }),
    )
    this.setStatus('backend: requested module')
    this.pushTimeline('send', 'music_window sent, agent invoked')
    return true
  }

  private connect(): void {
    if (this.stopped || this.socket) {
      return
    }

    this.clearRetryTimer()
    this.backendReady = false
    this.setStatus('backend: connecting')
    this.pushTimeline('connect', 'opening backend websocket')

    const socket = this.options.connect({
      onOpen: () => {
        if (this.socket !== socket) {
          return
        }

        this.setStatus('backend: connected')
        this.pushTimeline('socket', 'websocket connected')
      },
      onClose: () => {
        if (this.socket !== socket) {
          return
        }

        this.socket = null
        this.backendReady = false
        this.setStatus('backend: disconnected')
        this.pushTimeline('socket', 'websocket closed')
        this.options.onDisconnected?.()

        if (!this.stopped) {
          this.scheduleRetry()
        }
      },
      onError: () => {
        if (this.socket !== socket) {
          return
        }

        this.setStatus('backend: connection error')
        this.pushTimeline('socket', 'websocket connection error')
      },
      onMessage: (message) => {
        if (this.socket !== socket) {
          return
        }

        this.handleMessage(message)
      },
    })

    this.socket = socket
  }

  private handleMessage(message: SocketMessage): void {
    if (message.type === 'server_ready') {
      this.backendReady = true
      this.setStatus('backend: server_ready')
      this.pushTimeline('recv', 'server_ready received')
      this.options.onReady?.()
      return
    }

    if (message.type === 'visual_module') {
      const moduleId = typeof message.moduleId === 'string' ? message.moduleId : 'unknown-module'
      const source = typeof message.source === 'string' ? message.source : 'unknown'
      this.setStatus('backend: visual_module')
      this.pushTimeline('recv', `visual_module received: ${moduleId} (${source})`)
      this.options.onVisualModule?.(message)
      return
    }

    if (message.type === 'agent_error') {
      const errorMessage = typeof message.message === 'string' ? message.message : 'unknown agent error'
      this.setStatus('backend: agent_error')
      this.pushTimeline('agent', `agent_error: ${errorMessage}`)
      this.options.onAgentError?.(errorMessage)
      return
    }

    if (message.type === 'agent_status') {
      const phase = typeof message.phase === 'string' ? message.phase : 'unknown'
      this.pushTimeline('agent', `agent_status: ${phase}`)
      return
    }

    if (message.type === 'agent_trace') {
      const title = typeof message.title === 'string' ? message.title : 'agent trace'
      const content = typeof message.content === 'string' ? message.content : ''
      this.pushTimeline('agent', `${title}\n${content}`.trim())
      return
    }

    this.setStatus(`backend: ${message.type}`)
    this.pushTimeline('recv', `${message.type} received`)
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null || this.stopped) {
      return
    }

    this.setStatus(`backend: retrying in ${formatRetryDelay(this.retryDelayMs)}`)
    this.pushTimeline('retry', `reconnecting in ${formatRetryDelay(this.retryDelayMs)}`)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, this.retryDelayMs)
  }

  private clearRetryTimer(): void {
    if (this.retryTimer === null) {
      return
    }

    clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private setStatus(status: string): void {
    this.options.onStatusChange?.(status)
  }

  private pushTimeline(label: BackendTimelineLabel, message: string): void {
    this.options.onTimelineEntry?.({
      id: this.nextTimelineId++,
      createdAt: Date.now(),
      label,
      message,
    })
  }
}

function formatRetryDelay(delayMs: number): string {
  return `${(delayMs / 1000).toFixed(1)}s`
}
