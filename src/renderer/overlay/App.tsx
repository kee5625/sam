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

  const setInteractive = useCallback((on: boolean) => {
    void window.sam.invoke('overlay:set-interactive', on)
  }, [])

  const expand = useCallback(() => {
    setMode('expanded')
    setInteractive(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [setInteractive])

  const collapse = useCallback(() => {
    setMode('idle')
    setInteractive(false)
    setError('')
    setSuggestions(null)
    setConfirm(null)
  }, [setInteractive])

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
        await recorder.current.start()
        setListening(true)
        setStatus('Listening… (Alt+S to stop)')
      } catch {
        setError('Microphone unavailable — check Windows mic permissions. Typing still works.')
      }
    }
  }, [listening, submit])

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
          <button className={`micBtn${listening ? ' rec' : ''}`} onClick={() => void toggleVoice()}>
            {listening ? '■' : '🎤'}
          </button>
          <button className="clearBtn" onClick={() => void window.sam.invoke('settings:open')}>⚙</button>
        </div>

        {response && (
          <div className="response" dangerouslySetInnerHTML={{ __html: marked.parse(response) as string }} />
        )}

        {suggestions && (
          <div className="confirmBox">
            No app matched "{suggestions.query}". Did you mean:
            <div>
              {suggestions.apps.map((a) => (
                <button key={a.appId} className="sugBtn" onClick={() => void submit(`open ${a.name}`)}>
                  {a.name}
                </button>
              ))}
            </div>
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
