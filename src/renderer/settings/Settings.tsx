import { useEffect, useState } from 'react'
import './settings.css'

interface Cfg {
  groqApiKey: string
  openaiApiKey: string
  hotkeys: { toggleOverlay: string; pushToTalk: string; snip: string }
  launchAtStartup: boolean
  micDeviceId: string | null
  customApps: { name: string; path: string }[]
}

interface SessionData { apps: string[]; tabs: string[][] }

export default function Settings(): JSX.Element {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [mics, setMics] = useState<{ id: string; label: string }[]>([])
  const [sessions, setSessions] = useState<Record<string, SessionData>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [msg, setMsg] = useState('')
  const [failedKeys, setFailedKeys] = useState<string[]>([])

  useEffect(() => {
    void window.sam.invoke('config:get').then((c) => setCfg(c as Cfg))
    void window.sam.invoke('sessions:list').then((s) => setSessions(s as Record<string, SessionData>))
    void navigator.mediaDevices.enumerateDevices().then((devs) =>
      setMics(devs.filter((d) => d.kind === 'audioinput').map((d) => ({ id: d.deviceId, label: d.label || d.deviceId })))
    )
  }, [])

  if (!cfg) return <div className="page">Loading…</div>

  async function save(): Promise<void> {
    if (!cfg) return
    const cleaned: Cfg = {
      ...cfg,
      customApps: cfg.customApps.filter((a) => a.name.trim() && a.path.trim())
    }
    const failed = (await window.sam.invoke('config:set', cleaned)) as string[]
    setCfg(cleaned)
    setFailedKeys(failed)
    setMsg(failed.length ? '' : 'Saved')
    setTimeout(() => setMsg(''), 2000)
  }

  function startEdit(name: string): void {
    setEditing(name)
    setEditText(JSON.stringify(sessions[name], null, 2))
  }

  async function saveEdit(): Promise<void> {
    if (!editing) return
    try {
      const data = JSON.parse(editText) as SessionData
      await window.sam.invoke('sessions:save', editing, data)
      setSessions({ ...sessions, [editing]: data })
      setEditing(null)
    } catch {
      setMsg('Invalid JSON')
    }
  }

  async function del(name: string): Promise<void> {
    await window.sam.invoke('sessions:delete', name)
    const next = { ...sessions }
    delete next[name]
    setSessions(next)
  }

  return (
    <div className="page">
      <h2>API Keys</h2>
      <label>Groq API key (voice + commands + chat — free tier)</label>
      <input type="password" value={cfg.groqApiKey} onChange={(e) => setCfg({ ...cfg, groqApiKey: e.target.value })} />
      <label>OpenAI API key (screen snip questions)</label>
      <input type="password" value={cfg.openaiApiKey} onChange={(e) => setCfg({ ...cfg, openaiApiKey: e.target.value })} />

      <h2>Hotkeys</h2>
      <p className="note">Electron accelerator format, e.g. Alt+Space, Ctrl+Shift+K</p>
      <div className="row">
        <div>
          <label>Toggle overlay</label>
          <input value={cfg.hotkeys.toggleOverlay} onChange={(e) => setCfg({ ...cfg, hotkeys: { ...cfg.hotkeys, toggleOverlay: e.target.value } })} />
        </div>
        <div>
          <label>Push-to-talk</label>
          <input value={cfg.hotkeys.pushToTalk} onChange={(e) => setCfg({ ...cfg, hotkeys: { ...cfg.hotkeys, pushToTalk: e.target.value } })} />
        </div>
        <div>
          <label>Snip</label>
          <input value={cfg.hotkeys.snip} onChange={(e) => setCfg({ ...cfg, hotkeys: { ...cfg.hotkeys, snip: e.target.value } })} />
        </div>
      </div>
      {failedKeys.length > 0 && <div className="err">In use by another app: {failedKeys.join(', ')} — pick different bindings</div>}

      <h2>Custom apps</h2>
      <p className="note">Apps Sam can't find in the Start Menu — point at the .exe directly. Name is what you'll say ("open spotify").</p>
      {cfg.customApps.map((a, i) => (
        <div className="row" key={i} style={{ alignItems: 'flex-end' }}>
          <div>
            <label>Name</label>
            <input
              value={a.name}
              placeholder="spotify"
              onChange={(e) => {
                const next = [...cfg.customApps]
                next[i] = { ...next[i], name: e.target.value }
                setCfg({ ...cfg, customApps: next })
              }}
            />
          </div>
          <div style={{ flex: 2 }}>
            <label>Exe path</label>
            <input
              value={a.path}
              placeholder="C:\Users\you\AppData\Roaming\Spotify\Spotify.exe"
              onChange={(e) => {
                const next = [...cfg.customApps]
                next[i] = { ...next[i], path: e.target.value }
                setCfg({ ...cfg, customApps: next })
              }}
            />
          </div>
          <button
            className="danger"
            style={{ marginTop: 0 }}
            onClick={() => setCfg({ ...cfg, customApps: cfg.customApps.filter((_, j) => j !== i) })}
          >
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => setCfg({ ...cfg, customApps: [...cfg.customApps, { name: '', path: '' }] })}>
        Add app
      </button>

      <h2>General</h2>
      <label>Microphone</label>
      <select value={cfg.micDeviceId ?? ''} onChange={(e) => setCfg({ ...cfg, micDeviceId: e.target.value || null })}>
        <option value="">System default</option>
        {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      <div className="check">
        <input
          type="checkbox"
          checked={cfg.launchAtStartup}
          onChange={(e) => setCfg({ ...cfg, launchAtStartup: e.target.checked })}
        />
        Launch Sam when Windows starts
      </div>

      <button onClick={() => void save()}>Save</button>
      {msg && <div className={msg === 'Saved' ? 'ok' : 'err'}>{msg}</div>}

      <h2>Sessions</h2>
      {Object.keys(sessions).length === 0 && <p className="note">None saved. Say "save this as work mode".</p>}
      {Object.entries(sessions).map(([name, s]) => (
        <div className="sessionRow" key={name}>
          <span>{name} — {s.apps.length} apps, {s.tabs.flat().length} tabs</span>
          <button onClick={() => startEdit(name)}>Edit</button>
          <button className="danger" onClick={() => void del(name)}>Delete</button>
        </div>
      ))}
      {editing && (
        <div>
          <label>Editing "{editing}" (JSON: apps + tabs)</label>
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
          <button onClick={() => void saveEdit()}>Save session</button>
          <button className="danger" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
