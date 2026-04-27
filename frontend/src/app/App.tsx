import { startTransition, useEffect, useRef, useState } from 'react'

import { BACKEND_WS_URL } from '../config'
import { BackendConnection, type BackendTimelineEntry, type BackendTimelineLabel } from '../realtime/backendConnection'
import { createSocketClient } from '../realtime/socket'
import type { VisualModuleEnvelope } from '../contract/visualContract'
import { compileVisualModuleEnvelope } from '../visual/moduleLoader'
import { INITIAL_RUNTIME_SNAPSHOT, type RuntimeSnapshot } from '../visual/runtimeTypes'
import { VisualRuntime } from '../visual/runtime'
import './App.css'

const BACKEND_TIMELINE_LIMIT = 40
const MODULE_REQUEST_INTERVAL_MS = 30_000

export function App() {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<VisualRuntime | null>(null)
  const backendConnectionRef = useRef<BackendConnection | null>(null)
  const moduleRequestTimerRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const requestInFlightRef = useRef(false)
  const visualRequestsEnabledRef = useRef(false)
  const localTimelineIdRef = useRef(-1)
  const [status, setStatus] = useState('runtime idle')
  const [backendStatus, setBackendStatus] = useState('backend idle')
  const [moduleSource, setModuleSource] = useState('none')
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(INITIAL_RUNTIME_SNAPSHOT)
  const [timeline, setTimeline] = useState<BackendTimelineEntry[]>([])

  function appendTimelineEntry(entry: BackendTimelineEntry) {
    startTransition(() => {
      setTimeline((current) => [entry, ...current].slice(0, BACKEND_TIMELINE_LIMIT))
    })
  }

  function appendLocalTimeline(label: BackendTimelineLabel, message: string) {
    appendTimelineEntry({
      id: localTimelineIdRef.current--,
      createdAt: Date.now(),
      label,
      message,
    })
  }

  function finishModuleRequest() {
    requestInFlightRef.current = false
  }

  function requestVisualModule(): boolean {
    if (requestInFlightRef.current) {
      return false
    }

    const summary = runtimeRef.current?.getWindowSummary(30)
    if (!summary) {
      return false
    }

    const requested = backendConnectionRef.current?.requestMusicWindow(summary) ?? false
    if (!requested) {
      return false
    }

    requestInFlightRef.current = true
    return true
  }

  function ensureModulePolling() {
    if (moduleRequestTimerRef.current !== null) {
      return
    }

    moduleRequestTimerRef.current = window.setInterval(() => {
      if (!visualRequestsEnabledRef.current || requestInFlightRef.current) {
        return
      }

      void requestVisualModule()
    }, MODULE_REQUEST_INTERVAL_MS)
  }

  function enableVisualRequests() {
    visualRequestsEnabledRef.current = true
    ensureModulePolling()
  }

  function handleVisualModule(message: VisualModuleEnvelope) {
    try {
      const program = compileVisualModuleEnvelope(message)
      const queued = runtimeRef.current?.queueProgram(program) ?? false
      const source = message.source ?? 'llm'
      setModuleSource(source)
      setBackendStatus(queued ? `backend: loaded ${program.id}` : `backend: queued ${program.id}`)
      setStatus(
        queued
          ? `loaded ${source} module ${program.id}`
          : `remote module pending ${program.id}`,
      )
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      setBackendStatus('backend: module rejected')
      setStatus(`module rejected: ${messageText}`)
      appendLocalTimeline('recv', `visual_module rejected by frontend: ${messageText}`)
    } finally {
      finishModuleRequest()
    }
  }

  function handleAgentError(errorMessage: string) {
    setBackendStatus('backend: agent_error')
    setStatus(`agent error: ${errorMessage}`)
    finishModuleRequest()
  }

  useEffect(() => {
    if (!stageRef.current) {
      throw new Error('stage container is missing')
    }

    const runtime = new VisualRuntime(stageRef.current, {
      onStateChange(nextSnapshot) {
        startTransition(() => {
          setSnapshot(nextSnapshot)
        })
      },
    })
    runtime.mount()
    runtimeRef.current = runtime
    setStatus('runtime running')

    const socketClient = createSocketClient(BACKEND_WS_URL)
    const backendConnection = new BackendConnection({
      connect: (handlers) => socketClient.connect(handlers),
      onStatusChange: (nextStatus) => {
        setBackendStatus(nextStatus)
      },
      onTimelineEntry: appendTimelineEntry,
      onDisconnected: () => {
        finishModuleRequest()
        setStatus((current) =>
          current.includes('requesting visual')
            ? current.replace('requesting visual', 'waiting for backend')
            : current,
        )
      },
      onReady: () => {
        if (visualRequestsEnabledRef.current && !requestInFlightRef.current) {
          void requestVisualModule()
        }
      },
      onVisualModule: (message) => {
        handleVisualModule(message as VisualModuleEnvelope)
      },
      onAgentError: (errorMessage) => {
        handleAgentError(errorMessage)
      },
    })
    backendConnectionRef.current = backendConnection
    backendConnection.start()

    return () => {
      if (moduleRequestTimerRef.current !== null) {
        window.clearInterval(moduleRequestTimerRef.current)
        moduleRequestTimerRef.current = null
      }
      backendConnection.stop()
      backendConnectionRef.current = null
      runtime.unmount()
      runtimeRef.current = null
    }
  }, [])

  async function handleAudioFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      setStatus(`loading audio ${file.name}`)
      await runtimeRef.current?.loadAudioFile(file)
      setStatus(`loaded audio ${file.name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`audio load failed: ${message}`)
    } finally {
      event.target.value = ''
    }
  }

  async function playAudio() {
    try {
      await runtimeRef.current?.playAudio()
      enableVisualRequests()

      const requested = requestVisualModule()
      setStatus(requested ? 'audio playback running (requesting visual)' : 'audio playback running (waiting for backend)')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`audio play failed: ${message}`)
    }
  }

  function pauseAudio() {
    runtimeRef.current?.pauseAudio()
    setStatus('audio playback paused')
  }

  function useFallbackAudio() {
    runtimeRef.current?.useFallbackAudio()
    enableVisualRequests()

    const requested = requestVisualModule()
    setStatus(requested ? 'using demo audio analysis (requesting visual)' : 'using demo audio analysis (waiting for backend)')
  }

  return (
    <main className="app-shell">
      <section ref={stageRef} className="vj-stage" aria-label="AutoVJ stage" />

      <aside className="control-panel">
        <div>
          <p className="eyebrow">AutoVJ MVP</p>
          <h1>AI Visual Runtime</h1>
          <p className="description">
            现在整张画布都由后端生成的 Visual Module 决定。前端只负责安全运行时、音频分析、校验、挂载和持续渲染。
          </p>
        </div>

        <div className="status-row">
          <span>Runtime</span>
          <strong>{status}</strong>
        </div>

        <div className="status-row secondary">
          <span>Backend</span>
          <strong>{backendStatus}</strong>
        </div>

        <div className="status-row secondary">
          <span>Module Source</span>
          <strong>{moduleSource}</strong>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <span>Active</span>
            <strong>{snapshot.activeModuleId ?? 'booting'}</strong>
          </article>
          <article className="metric-card">
            <span>Next</span>
            <strong>{snapshot.nextModuleId ?? 'queued by runtime'}</strong>
          </article>
          <article className="metric-card">
            <span>Energy</span>
            <strong>{snapshot.audio.energy.toFixed(2)}</strong>
          </article>
          <article className="metric-card">
            <span>FPS</span>
            <strong>{snapshot.fps}</strong>
          </article>
          <article className="metric-card">
            <span>Bass</span>
            <strong>{snapshot.audio.bassEnergy.toFixed(2)}</strong>
          </article>
          <article className="metric-card">
            <span>BPM</span>
            <strong>{snapshot.audio.bpm.toFixed(0)}</strong>
          </article>
        </div>

        <div className="status-row tertiary">
          <span>Transition</span>
          <strong>{snapshot.transitioning ? 'crossfading' : 'stable'}</strong>
        </div>

        <div className="audio-panel">
          <div className="status-row secondary compact">
            <span>Audio</span>
            <strong>{snapshot.audioEngine.usingFallback ? 'demo analyzer' : snapshot.audioStatus}</strong>
          </div>
          <p className="audio-source">
            {snapshot.audioEngine.sourceName ?? '未选择音频文件，当前使用 demo 音频分析'}
          </p>
          <div className="audio-progress">
            <span>{snapshot.audioEngine.currentTime.toFixed(1)}s</span>
            <span>{snapshot.audioEngine.duration > 0 ? `${snapshot.audioEngine.duration.toFixed(1)}s` : 'live'}</span>
          </div>
          <div className="audio-actions">
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              选择本地音频
            </button>
            <button type="button" className="secondary-button" onClick={playAudio}>
              播放
            </button>
            <button type="button" className="secondary-button" onClick={pauseAudio}>
              暂停
            </button>
            <button type="button" className="ghost-button" onClick={useFallbackAudio}>
              用 Demo 音频
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden-input"
            onChange={handleAudioFileChange}
          />
          {snapshot.audioError ? <p className="audio-error">{snapshot.audioError}</p> : null}
        </div>

        <section className="timeline-panel" aria-labelledby="backend-timeline-heading">
          <div className="timeline-header">
            <div>
              <p className="timeline-eyebrow">Realtime Logs</p>
              <h2 id="backend-timeline-heading">Backend Timeline</h2>
            </div>
            <strong>{timeline.length}</strong>
          </div>

          <div className="timeline-list" role="log" aria-live="polite">
            {timeline.length === 0 ? (
              <p className="timeline-empty">页面初始化后会自动连接后端，关键链路会显示在这里。</p>
            ) : (
              timeline.map((entry) => (
                <article key={entry.id} className="timeline-entry">
                  <div className="timeline-meta">
                    <span className={`timeline-label ${entry.label}`}>{entry.label}</span>
                    <time dateTime={new Date(entry.createdAt).toISOString()}>{formatTimelineTime(entry.createdAt)}</time>
                  </div>
                  <p>{entry.message}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </aside>
    </main>
  )
}

function formatTimelineTime(createdAt: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(createdAt)
}
