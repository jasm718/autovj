export type SocketMessage = {
  type: string
  payload?: unknown
  [key: string]: unknown
}

export type SocketClientHandlers = {
  onMessage: (message: SocketMessage) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: () => void
}

export function createSocketClient(url: string) {
  return {
    connect(handlers: SocketClientHandlers): WebSocket {
      const socket = new WebSocket(url)

      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data) as SocketMessage
        handlers.onMessage(message)
      })

      socket.addEventListener('open', () => handlers.onOpen?.())
      socket.addEventListener('close', () => handlers.onClose?.())
      socket.addEventListener('error', () => handlers.onError?.())

      return socket
    },
  }
}
