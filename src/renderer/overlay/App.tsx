import { useCallback, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { Recorder } from './recorder'
import './overlay.css'

type Mode = 'idle' | 'expanded'

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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export default function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('idle')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [attached, setAttached] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<SaveConfirm | null>(null)
  const [suggestions, setSuggestions] = useState<{ query: string; apps: Suggestion[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recorder = useRef(new Recorder())
  const interactiveRef = useRef(false)

  const expand = useCallback(() => {
    setMode('expanded')
    // interactive immediately so the input can take keyboard focus;
    // the mousemove tracker corrects mouse pass-through from here on
    interactiveRef.current = true
    void window.sam.invoke('overlay:set-interactive', true)
    void window.sam.invoke('overlay:focus')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const collapse = useCallback(() => {
    setMode('idle')
    interactiveRef.current = false
    void window.sam.invoke('overlay:set-interactive', false)
    setError('')
    setSuggestions(null)
    setConfirm(null)
  }, [])

  const submit = useCallback(async (text: string) => {
    if (!text.trim() || busy) return
    setBusy(true)
    setResponse('')
    setError('')
    setStatus('')
    setSuggestions(null)
    setInput('')
    await window.sam.invoke('submit', text.trim())
    setBusy(false)
  }, [busy])

  const toggleVoice = useCallback(async () => {
    if (listening) {
      setListening(false)
      setStatus('Transcribing…')
      try {
        const audio = await recorder.current.stop()
        const text = (await window.sam.invoke('voice:transcribe', audio)) as string
        setStatus('')
        if (text) {
          setInput(text)
          await submit(text)
        }
      } catch (e) {
        setStatus('')
        setError(e instanceof Error ? e.message : String(e))
      }
    } else {
      try {
        const cfg = (await window.sam.invoke('config:get')) as { micDeviceId: string | null }
        await recorder.current.start(cfg.micDeviceId)
        setListening(true)
        setStatus('Listening… (Alt+S to stop)')
      } catch {
        setError('Microphone unavailable — check Windows mic permissions. Typing still works.')
      }
    }
  }, [listening, submit])

  // Hover-tracked interactivity: the window itself stays click-through
  // (mouse events forwarded); only the visible pill/panel grabs the mouse.
  // Scroll and clicks anywhere else fall through to the apps below.
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const over = !!(e.target as HTMLElement).closest?.('.panel, .pill')
      if (over !== interactiveRef.current) {
        interactiveRef.current = over
        void window.sam.invoke('overlay:set-interactive', over)
      }
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    const offHotkey = window.sam.on('hotkey', (...args: unknown[]) => {
      const name = args[0] as string
      if (name === 'toggleOverlay') {
        setMode((m) => {
          if (m === 'idle') { expand(); return 'expanded' }
          collapse(); return 'idle'
        })
      }
      if (name === 'pushToTalk') {
        expand()
        void toggleVoice()
      }
    })

    const offEvent = window.sam.on('assistant:event', (...args: unknown[]) => {
      const ev = args[0] as { kind: string; [k: string]: unknown }
      switch (ev.kind) {
        case 'token': setResponse((r) => r + (ev.text as string)); break
        case 'status': setStatus(ev.text as string); break
        case 'result': setResponse(ev.text as string); setStatus(''); break
        case 'error': setError(ev.text as string); setStatus(''); break
        case 'done': setStatus(''); break
        case 'suggestions':
          setSuggestions({ query: ev.query as string, apps: ev.apps as Suggestion[] })
          break
        case 'confirm-save':
          setConfirm(ev as unknown as SaveConfirm)
          break
      }
    })

    const offSnip = window.sam.on('snip:attached', (...args: unknown[]) => {
      setAttached(args[0] as string)
      expand()
    })

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') collapse()
    }
    window.addEventListener('keydown', onKey)
    return () => { offHotkey(); offEvent(); offSnip(); window.removeEventListener('keydown', onKey) }
  }, [expand, collapse, toggleVoice])

  if (mode === 'idle') {
    return (
      <div className="wrap">
        <div className="pill" onClick={expand}>
          <span className={`dot${listening ? ' listening' : ''}`} />
          <span>Sam</span>
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="panel">
        {attached && (
          <div className="attachRow">
            <img className="thumb" src={attached} alt="snip" />
            <button className="clearBtn" onClick={() => { setAttached(null); void window.sam.invoke('image:clear') }}>
              ✕ clear
            </button>
          </div>
        )}
        <div className="inputRow">
          <span className={`dot${listening ? ' listening' : ''}`} />
          <input
            ref={inputRef}
            value={input}
            placeholder={attached ? 'Ask about the snip…' : 'Ask anything, or "open spotify"…'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(input) }}
          />
          <button
            className={`micBtn${listening ? ' rec' : ''}`}
            title={listening ? 'Stop recording' : 'Voice input'}
            onClick={() => void toggleVoice()}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </button>
          <button className="clearBtn" title="Settings" onClick={() => void window.sam.invoke('settings:open')}>
            <GearIcon />
          </button>
        </div>

        {busy && !response && (
          <div className="dots"><span /><span /><span /></div>
        )}

        {response && (
          <div className="response" dangerouslySetInnerHTML={{ __html: marked.parse(response) as string }} />
        )}

        {suggestions && (
          <div className="confirmBox">
            {suggestions.apps.length > 0 ? (
              <>
                No app matched "{suggestions.query}". Did you mean:
                <div>
                  {suggestions.apps.map((a) => (
                    <button key={a.appId} className="sugBtn" onClick={() => void submit(`open ${a.name}`)}>
                      {a.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>No app called "{suggestions.query}" found. If it's not in the Start Menu, add its .exe under Settings → Custom apps.</>
            )}
          </div>
        )}

        {confirm && (
          <div className="confirmBox">
            Save session <b>{confirm.name}</b>?
            {confirm.warning && <div className="error">{confirm.warning}</div>}
            <ul>
              {confirm.apps.map((a) => <li key={a}>app: {a}</li>)}
              {confirm.tabs.flat().map((t) => <li key={t}>tab: {t}</li>)}
            </ul>
            <button
              className="sugBtn"
              onClick={() => {
                void window.sam.invoke('session:confirm-save', {
                  name: confirm.name, apps: confirm.apps, tabs: confirm.tabs
                })
                setConfirm(null)
              }}
            >
              Save
            </button>
            <button className="sugBtn" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        )}

        {status && <div className="status">{status}</div>}
        {error && <div className="status error">{error}</div>}
      </div>
    </div>
  )
}
