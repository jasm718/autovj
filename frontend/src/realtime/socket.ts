type SocketMessage = {
  type: string
  payload?: unknown
}

export function createSocketClient(url: string) {
  return {
    connect(onMessage: (message: SocketMessage) => void): WebSocket {
      const socket = new WebSocket(url)

      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data) as SocketMessage
        onMessage(message)
      })

      socket.addEventListener('error', () => {
        throw new Error(`websocket connection failed: ${url}`)
      })

      return socket
    },
  }
}
