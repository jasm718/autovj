import { useEffect, useRef, useState } from 'react'

import { createSocketClient } from '../realtime/socket'
import { VisualRuntime } from '../visual/runtime'
import './App.css'

export function App() {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<VisualRuntime | null>(null)
  const [status, setStatus] = useState('runtime idle')

  useEffect(() => {
    if (!stageRef.current) {
      throw new Error('stage container is missing')
    }

    const runtime = new VisualRuntime(stageRef.current)
    runtime.mount()
    runtimeRef.current = runtime
    setStatus('runtime mounted')

    return () => {
      runtime.unmount()
      runtimeRef.current = null
    }
  }, [])

  function connectBackend() {
    const socket = createSocketClient('ws://127.0.0.1:8000/ws')
    socket.connect((message) => {
      setStatus(`backend: ${message.type}`)
    })
  }

  return (
    <main className="app-shell">
      <section ref={stageRef} className="vj-stage" aria-label="AutoVJ stage" />

      <aside className="control-panel">
        <div>
          <p className="eyebrow">AutoVJ MVP</p>
          <h1>AI Visual Runtime</h1>
          <p className="description">
            p5.js 背景层与 three.js 前景层的容器已就绪，后续会接入音乐分析和受限模块加载。
          </p>
        </div>

        <div className="status-row">
          <span>Status</span>
          <strong>{status}</strong>
        </div>

        <button type="button" onClick={connectBackend}>
          连接后端 WebSocket
        </button>
      </aside>
    </main>
  )
}
