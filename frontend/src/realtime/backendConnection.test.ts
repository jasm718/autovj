import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackendConnection, type BackendTimelineEntry } from './backendConnection'

type TestSocketHandlers = {
  onMessage: (message: { type: string; [key: string]: unknown }) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: () => void
}

class FakeSocket {
  readyState = 0
  readonly sentMessages: string[] = []

  constructor(private readonly handlers: TestSocketHandlers) {}

  send(payload: string): void {
    this.sentMessages.push(payload)
  }

  close(): void {
    this.readyState = 3
    this.handlers.onClose?.()
  }

  emitOpen(): void {
    this.readyState = 1
    this.handlers.onOpen?.()
  }

  emitClose(): void {
    this.readyState = 3
    this.handlers.onClose?.()
  }

  emitError(): void {
    this.handlers.onError?.()
  }

  emitMessage(message: { type: string; [key: string]: unknown }): void {
    this.handlers.onMessage(message)
  }
}

function createSocketFactory() {
  const sockets: FakeSocket[] = []

  return {
    sockets,
    connect(handlers: TestSocketHandlers) {
      const socket = new FakeSocket(handlers)
      sockets.push(socket)
      return socket
    },
  }
}

describe('BackendConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens a websocket immediately when started', () => {
    const statuses: string[] = []
    const logs: BackendTimelineEntry[] = []
    const socketFactory = createSocketFactory()
    const connection = new BackendConnection({
      connect: socketFactory.connect,
      onStatusChange: (status) => statuses.push(status),
      onTimelineEntry: (entry) => logs.push(entry),
    })

    connection.start()

    expect(socketFactory.sockets).toHaveLength(1)
    expect(statuses).toContain('backend: connecting')
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'connect',
        }),
      ]),
    )
  })

  it('schedules a reconnect after the socket closes unexpectedly', () => {
    const statuses: string[] = []
    const logs: BackendTimelineEntry[] = []
    const socketFactory = createSocketFactory()
    const connection = new BackendConnection({
      connect: socketFactory.connect,
      retryDelayMs: 2_000,
      onStatusChange: (status) => statuses.push(status),
      onTimelineEntry: (entry) => logs.push(entry),
    })

    connection.start()
    socketFactory.sockets[0]?.emitOpen()
    socketFactory.sockets[0]?.emitClose()

    expect(statuses).toContain('backend: retrying in 2.0s')
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'retry',
        }),
      ]),
    )

    vi.advanceTimersByTime(2_000)

    expect(socketFactory.sockets).toHaveLength(2)
  })

  it('waits for server_ready before sending music windows and logs the agent request', () => {
    const logs: BackendTimelineEntry[] = []
    const socketFactory = createSocketFactory()
    const connection = new BackendConnection({
      connect: socketFactory.connect,
      onTimelineEntry: (entry) => logs.push(entry),
    })

    connection.start()
    const socket = socketFactory.sockets[0]
    expect(socket).toBeDefined()

    expect(connection.requestMusicWindow({ energy: 0.42 })).toBe(false)

    socket?.emitOpen()
    socket?.emitMessage({ type: 'server_ready' })

    expect(connection.requestMusicWindow({ energy: 0.42 })).toBe(true)
    expect(socket?.sentMessages).toHaveLength(1)
    expect(JSON.parse(socket?.sentMessages[0] ?? '{}')).toMatchObject({
      type: 'music_window',
      payload: { energy: 0.42 },
    })
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'send',
          message: expect.stringContaining('agent'),
        }),
      ]),
    )
  })

  it('forwards backend outcomes into timeline entries', () => {
    const logs: BackendTimelineEntry[] = []
    const visualModules: Array<{ type: string; moduleId?: string }> = []
    const agentErrors: string[] = []
    const socketFactory = createSocketFactory()
    const connection = new BackendConnection({
      connect: socketFactory.connect,
      onTimelineEntry: (entry) => logs.push(entry),
      onVisualModule: (message) => visualModules.push(message as { type: string; moduleId?: string }),
      onAgentError: (message) => agentErrors.push(message),
    })

    connection.start()
    const socket = socketFactory.sockets[0]
    socket?.emitOpen()
    socket?.emitMessage({ type: 'server_ready' })
    socket?.emitMessage({ type: 'visual_module', moduleId: 'agent-demo-01', source: 'llm' })
    socket?.emitMessage({ type: 'agent_error', message: 'model timeout' })

    expect(visualModules).toEqual([{ type: 'visual_module', moduleId: 'agent-demo-01', source: 'llm' }])
    expect(agentErrors).toEqual(['model timeout'])
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'recv',
          message: expect.stringContaining('agent-demo-01'),
        }),
        expect.objectContaining({
          label: 'agent',
          message: expect.stringContaining('model timeout'),
        }),
      ]),
    )
  })

  it('records model input and output traces in the timeline', () => {
    const logs: BackendTimelineEntry[] = []
    const socketFactory = createSocketFactory()
    const connection = new BackendConnection({
      connect: socketFactory.connect,
      onTimelineEntry: (entry) => logs.push(entry),
    })

    connection.start()
    const socket = socketFactory.sockets[0]
    socket?.emitOpen()
    socket?.emitMessage({ type: 'server_ready' })
    socket?.emitMessage({
      type: 'agent_trace',
      stage: 'model_input',
      title: 'model input',
      content: 'SYSTEM\\nYou are AutoVJ\\n\\nUSER\\nmake it calm',
    })
    socket?.emitMessage({
      type: 'agent_trace',
      stage: 'model_output',
      title: 'model output',
      content: '{"type":"visual_module"}',
    })

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'agent',
          message: expect.stringContaining('model input'),
        }),
        expect.objectContaining({
          label: 'agent',
          message: expect.stringContaining('visual_module'),
        }),
      ]),
    )
  })

  it('notifies the app when the socket closes mid-request', () => {
    const interruptedRequests: string[] = []
    const socketFactory = createSocketFactory()
    const connection = new BackendConnection({
      connect: socketFactory.connect,
      onDisconnected: () => interruptedRequests.push('closed'),
    })

    connection.start()
    const socket = socketFactory.sockets[0]
    socket?.emitOpen()
    socket?.emitMessage({ type: 'server_ready' })
    expect(connection.requestMusicWindow({ energy: 0.99 })).toBe(true)

    socket?.emitClose()

    expect(interruptedRequests).toEqual(['closed'])
  })
})
