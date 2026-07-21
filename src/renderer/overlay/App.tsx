import { useCallback, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { Recorder } from './recorder'
import Todo, { type TodoItem } from './Todo'
import './overlay.css'

// Window is hidden by default (main process). When summoned it renders one of:
//   type    - command bar (+ optional response / suggestion / confirm card)
//   listen  - compact listening pill (Alt+S, voice)
//   toast   - brief command confirmation / error, auto-hides
type Mode = 'type' | 'listen' | 'toast'

interface SaveConfirm {
  name: string
  apps: string[]
  tabs: string[][]
  warning?: string
}

interface Suggestion {
  name: string
  appId: string
}

function MicIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
    </svg>
  )
}

function StopIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function GearIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function SaveIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  )
}

function XIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

export default function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('type')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [lastQuery, setLastQuery] = useState('')
  const [response, setResponse] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [attached, setAttached] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<SaveConfirm | null>(null)
  const [toastError, setToastError] = useState(false)
  const [suggestions, setSuggestions] = useState<{ query: string; apps: Suggestion[] } | null>(null)
  const [showTodo, setShowTodo] = useState(false)
  // UI-only: in-memory todos (no persistence yet)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const recorder = useRef(new Recorder())
  const interactiveRef = useRef(false)
  const voiceRef = useRef(false)
  const streamedRef = useRef(false)
  const finishingRef = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Apply the configured accent once on mount
  useEffect(() => {
    void window.sam.invoke('config:get').then((c) => {
      const accent = (c as { accent?: string }).accent === 'green' ? 'green' : 'blue'
      document.documentElement.setAttribute('data-accent', accent)
    })
  }, [])

  const setInteractive = useCallback((on: boolean) => {
    if (on === interactiveRef.current) return
    interactiveRef.current = on
    void window.sam.invoke('overlay:set-interactive', on)
  }, [])

  const hide = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setInteractive(false)
    void window.sam.invoke('overlay:hide')
  }, [setInteractive])

  const scheduleHide = useCallback((ms: number) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => hide(), ms)
  }, [hide])

  const resetView = useCallback(() => {
    setResponse('')
    setError('')
    setStatus('')
    setSuggestions(null)
    setConfirm(null)
    setToastError(false)
    streamedRef.current = false
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
  }, [])

  /** Compact transient message that auto-hides — never opens the full panel. */
  const flashToast = useCallback((text: string, isError: boolean) => {
    setResponse(text)
    setToastError(isError)
    setMode('toast')
    scheduleHide(isError ? 2600 : 1700)
  }, [scheduleHide])

  const openType = useCallback(() => {
    resetView()
    setShowTodo(false)
    voiceRef.current = false
    setMode('type')
    setInteractive(true)
    void window.sam.invoke('overlay:focus')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [resetView, setInteractive])

  const submit = useCallback(async (text: string) => {
    if (!text.trim() || busy) return
    // "todo" opens the inline panel — handled locally, no backend round-trip
    if (text.trim().toLowerCase() === 'todo') {
      resetView()
      setInput('')
      setMode('type')
      setInteractive(true)
      setShowTodo(true)
      return
    }
    setShowTodo(false)
    setBusy(true)
    setLastQuery(text.trim())
    setResponse('')
    setError('')
    setStatus('')
    setSuggestions(null)
    setInput('')
    streamedRef.current = false
    await window.sam.invoke('submit', text.trim())
    setBusy(false)
  }, [busy, resetView, setInteractive])

  const addTodo = useCallback((text: string) => {
    setTodos((t) => [...t, { id: crypto.randomUUID(), text, done: false }])
  }, [])
  const toggleTodo = useCallback((id: string) => {
    setTodos((t) => t.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
  }, [])
  const editTodo = useCallback((id: string, text: string) => {
    setTodos((t) => t.map((i) => (i.id === id ? { ...i, text } : i)))
  }, [])
  const removeTodo = useCallback((id: string) => {
    setTodos((t) => t.filter((i) => i.id !== id))
  }, [])

  const finishVoice = useCallback(async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    setListening(false)
    setStatus('Transcribing…')
    try {
      const audio = await recorder.current.stop()
      const text = (await window.sam.invoke('voice:transcribe', audio)) as string
      setStatus('')
      if (!text.trim()) { flashToast("Didn't catch that", true); return }
      await submit(text)
    } catch (e) {
      setStatus('')
      flashToast(e instanceof Error ? e.message : String(e), true)
    }
  }, [submit, flashToast])

  const startVoice = useCallback(async () => {
    resetView()
    voiceRef.current = true
    finishingRef.current = false
    setMode('listen')
    void window.sam.invoke('overlay:focus')
    try {
      const cfg = (await window.sam.invoke('config:get')) as { micDeviceId: string | null }
      await recorder.current.start(cfg.micDeviceId, { onSilence: () => void finishVoice() })
      setListening(true)
      setStatus('Listening…')
    } catch {
      setMode('type')
      setInteractive(true)
      setError('Microphone unavailable — check Windows mic permissions. Typing still works.')
    }
  }, [resetView, finishVoice, setInteractive])

  // Hover-tracked interactivity: window stays click-through; only the visible
  // surfaces grab the mouse, so scroll & clicks elsewhere pass through.
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const over = !!(e.target as HTMLElement).closest?.('.cmdbar, .card, .listening, .toast, .attachRow')
      setInteractive(over)
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [setInteractive])

  useEffect(() => {
    const offHotkey = window.sam.on('hotkey', (...args: unknown[]) => {
      const name = args[0] as string
      if (name === 'toggleOverlay') openType()
      if (name === 'pushToTalk') {
        if (listening) void finishVoice()
        else void startVoice()
      }
    })

    const offEvent = window.sam.on('assistant:event', (...args: unknown[]) => {
      const ev = args[0] as { kind: string; [k: string]: unknown }
      switch (ev.kind) {
        case 'token':
          streamedRef.current = true
          setMode('type')
          setInteractive(true)
          setStatus('')
          setResponse((r) => r + (ev.text as string))
          break
        case 'status':
          setStatus(ev.text as string)
          break
        case 'result':
          setResponse(ev.text as string)
          setStatus('')
          if (voiceRef.current && !streamedRef.current) {
            setMode('toast')
            scheduleHide(1700)
          } else {
            setMode('type')
            setInteractive(true)
          }
          break
        case 'error':
          setStatus('')
          if (voiceRef.current && !streamedRef.current) {
            flashToast(ev.text as string, true)
          } else {
            setMode('type')
            setInteractive(true)
            setError(ev.text as string)
          }
          break
        case 'done':
          setStatus('')
          break
        case 'suggestions':
          setMode('type')
          setInteractive(true)
          setSuggestions({ query: ev.query as string, apps: ev.apps as Suggestion[] })
          break
        case 'confirm-save':
          setMode('type')
          setInteractive(true)
          setConfirm(ev as unknown as SaveConfirm)
          break
        case 'open-view':
          if (ev.view === 'todo') {
            setMode('type')
            setInteractive(true)
            setShowTodo(true)
          }
          break
      }
    })

    const offSnip = window.sam.on('snip:attached', (...args: unknown[]) => {
      resetView()
      voiceRef.current = false
      setAttached(args[0] as string)
      setMode('type')
      setInteractive(true)
      void window.sam.invoke('overlay:focus')
      setTimeout(() => inputRef.current?.focus(), 50)
    })

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (listening) { void recorder.current.stop().catch(() => {}); setListening(false) }
        hide()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { offHotkey(); offEvent(); offSnip(); window.removeEventListener('keydown', onKey) }
  }, [openType, startVoice, finishVoice, listening, hide, resetView, scheduleHide, setInteractive, flashToast])

  // Compact listening pill — voice mode
  if (mode === 'listen') {
    return (
      <div className="wrap">
        <div className="listening">
          <span className="orb" />
          <span className="eq"><span /><span /><span /><span /><span /></span>
          <span className="listenLabel">{status || 'Listening…'}</span>
          <span className="escTag">Esc</span>
        </div>
      </div>
    )
  }

  // Brief command confirmation / transient error
  if (mode === 'toast') {
    return (
      <div className="wrap">
        <div className={`toast${toastError ? ' err' : ''}`}>
          <span className="badge">{toastError ? '✕' : '✓'}</span>
          <span dangerouslySetInnerHTML={{ __html: marked.parseInline(response) as string }} />
        </div>
      </div>
    )
  }

  // Type mode — command bar + optional cards
  return (
    <div className="wrap">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        {attached && (
          <div className="attachRow">
            <img className="thumb" src={attached} alt="snip" />
            <button className="clearBtn" onClick={() => { setAttached(null); void window.sam.invoke('image:clear') }}>
              <XIcon /> Clear
            </button>
          </div>
        )}

        <div className="cmdbar">
          <span className="orb float" />
          <input
            ref={inputRef}
            value={input}
            placeholder={attached ? 'Ask about the snip…' : 'Ask anything, or “open spotify”…'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(input) }}
          />
          <button
            className={`iconBtn${listening ? ' rec' : ''}`}
            title={listening ? 'Stop' : 'Voice input'}
            onClick={() => (listening ? void finishVoice() : void startVoice())}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </button>
          <button className="iconBtn dim" title="Settings" onClick={() => void window.sam.invoke('settings:open')}>
            <GearIcon />
          </button>
        </div>

        {showTodo && (
          <Todo
            items={todos}
            onAdd={addTodo}
            onToggle={toggleTodo}
            onEdit={editTodo}
            onRemove={removeTodo}
          />
        )}

        {busy && !response && (
          <div className="card"><div className="dots"><span /><span /><span /></div></div>
        )}

        {response && (
          <div className="card">
            <div className="cardHead">
              <span className="orb" />
              <span className="q">{lastQuery || 'Sam'}</span>
              <span className="hint">↵ send</span>
            </div>
            <div className="response" dangerouslySetInnerHTML={{ __html: marked.parse(response) as string }} />
          </div>
        )}

        {suggestions && (
          <div className="card">
            <div className="cardHead">
              <span className="orb" />
              <span className="q">open {suggestions.query}</span>
            </div>
            <div className="sugBody">
              {suggestions.apps.length > 0 ? (
                <>
                  <div className="sugLead">No app matched <b>“{suggestions.query}”</b>. Did you mean:</div>
                  <div className="chips">
                    {suggestions.apps.map((a, i) => (
                      <button
                        key={a.appId}
                        className={`chip${i === 0 ? ' primary' : ''}`}
                        onClick={() => void submit(`open ${a.name}`)}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                  <div className="hintRow">
                    <PlusIcon />
                    Not here? Add its .exe under <span className="accent">Settings → Custom apps</span>
                  </div>
                </>
              ) : (
                <div className="hintRow">
                  <PlusIcon />
                  No app called “{suggestions.query}”. Add its .exe under <span className="accent">Settings → Custom apps</span>
                </div>
              )}
            </div>
          </div>
        )}

        {confirm && (
          <div className="card">
            <div className="confirmBody">
              <div className="confirmTitle">
                <SaveIcon />
                Save session <b style={{ fontWeight: 600 }}>“{confirm.name}”</b>?
              </div>
              {confirm.warning && <div className="confirmWarn">{confirm.warning}</div>}
              <div className="confirmGrid">
                <div>
                  <div className="colLabel">Apps · {confirm.apps.length}</div>
                  <div className="colList">
                    {confirm.apps.map((a) => (
                      <div className="colItem" key={a}><span className="bullet" />{a}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="colLabel">Tabs · {confirm.tabs.flat().length}</div>
                  <div className="colList">
                    {confirm.tabs.flat().map((t) => (
                      <div className="colItem tab" key={t}><span className="bullet" />{t}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="btnRow">
                <button
                  className="btnPrimary"
                  onClick={() => {
                    void window.sam.invoke('session:confirm-save', {
                      name: confirm.name, apps: confirm.apps, tabs: confirm.tabs
                    })
                    setConfirm(null)
                  }}
                >
                  Save session
                </button>
                <button className="btnGhost" onClick={() => setConfirm(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {status && <div className="status">{status}</div>}
        {error && <div className="status error">{error}</div>}
      </div>
    </div>
  )
}
