import { useEffect, useState } from 'react'
import './settings.css'

interface Cfg {
  groqApiKey: string
  openaiApiKey: string
  hotkeys: { toggleOverlay: string; pushToTalk: string; snip: string }
  launchAtStartup: boolean
  micDeviceId: string | null
  customApps: { name: string; path: string }[]
  accent: 'blue' | 'green'
}

interface SessionData { apps: string[]; tabs: string[][] }

type Section = 'keys' | 'hotkeys' | 'general' | 'apps' | 'sessions'

function KeyIcon(): JSX.Element {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
}
function KbdIcon(): JSX.Element {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M8 14h8" /></svg>
}
function MicIcon(): JSX.Element {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" /></svg>
}
function GridIcon(): JSX.Element {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
}
function SessIcon(): JSX.Element {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4" /></svg>
}
function WarnIcon(): JSX.Element {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
}
function PlusIcon(): JSX.Element {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
}

const NAV: { id: Section; label: string; icon: () => JSX.Element }[] = [
  { id: 'keys', label: 'API keys', icon: KeyIcon },
  { id: 'hotkeys', label: 'Hotkeys', icon: KbdIcon },
  { id: 'general', label: 'General', icon: MicIcon },
  { id: 'apps', label: 'Custom apps', icon: GridIcon },
  { id: 'sessions', label: 'Sessions', icon: SessIcon }
]

export default function Settings(): JSX.Element {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [section, setSection] = useState<Section>('keys')
  const [mics, setMics] = useState<{ id: string; label: string }[]>([])
  const [sessions, setSessions] = useState<Record<string, SessionData>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [msg, setMsg] = useState('')
  const [failedKeys, setFailedKeys] = useState<string[]>([])

  useEffect(() => {
    void window.sam.invoke('config:get').then((c) => {
      const k = c as Cfg
      setCfg(k)
      document.documentElement.setAttribute('data-accent', k.accent === 'green' ? 'green' : 'blue')
    })
    void window.sam.invoke('sessions:list').then((s) => setSessions(s as Record<string, SessionData>))
    void navigator.mediaDevices.enumerateDevices().then((devs) =>
      setMics(devs.filter((d) => d.kind === 'audioinput').map((d) => ({ id: d.deviceId, label: d.label || d.deviceId })))
    )
  }, [])

  if (!cfg) return <div className="win"><div className="content">Loading…</div></div>

  const update = (patch: Partial<Cfg>): void => setCfg({ ...cfg, ...patch })

  async function save(): Promise<void> {
    if (!cfg) return
    const cleaned: Cfg = { ...cfg, customApps: cfg.customApps.filter((a) => a.name.trim() && a.path.trim()) }
    const failed = (await window.sam.invoke('config:set', cleaned)) as string[]
    setCfg(cleaned)
    document.documentElement.setAttribute('data-accent', cleaned.accent)
    setFailedKeys(failed)
    setMsg(failed.length ? 'Hotkey conflict — see Hotkeys' : 'Saved')
    setTimeout(() => setMsg(''), 2500)
  }

  function startEdit(name: string): void { setEditing(name); setEditText(JSON.stringify(sessions[name], null, 2)) }
  async function saveEdit(): Promise<void> {
    if (!editing) return
    try {
      const data = JSON.parse(editText) as SessionData
      await window.sam.invoke('sessions:save', editing, data)
      setSessions({ ...sessions, [editing]: data })
      setEditing(null)
    } catch { setMsg('Invalid JSON') }
  }
  async function del(name: string): Promise<void> {
    await window.sam.invoke('sessions:delete', name)
    const next = { ...sessions }; delete next[name]; setSessions(next)
  }

  return (
    <div className="win">
      <div className="titlebar">
        <span className="orb" />
        <span className="title">Sam — Settings</span>
      </div>

      <div className="body">
        <div className="sidebar">
          {NAV.map((n) => {
            const Icon = n.icon
            return (
              <button key={n.id} className={`navItem${section === n.id ? ' active' : ''}`} onClick={() => setSection(n.id)}>
                <Icon /> {n.label}
              </button>
            )
          })}
        </div>

        <div className="content">
          {section === 'keys' && (
            <div className="section">
              <div className="sectionTitle">API keys</div>
              <div className="field">
                <label>Groq API key <span className="muted">— voice + commands + chat (free tier)</span></label>
                <input type="password" className="mono" value={cfg.groqApiKey} onChange={(e) => update({ groqApiKey: e.target.value })} />
              </div>
              <div className="field">
                <label>OpenAI API key <span className="muted">— screen-snip vision + fallback</span></label>
                <input type="password" className="mono" value={cfg.openaiApiKey} onChange={(e) => update({ openaiApiKey: e.target.value })} />
              </div>
            </div>
          )}

          {section === 'hotkeys' && (
            <div className="section">
              <div className="sectionTitle">Hotkeys</div>
              <p className="note">Electron accelerator format, e.g. Alt+Space, Ctrl+Shift+K</p>
              <div className="row3">
                <div className="field">
                  <label>Toggle overlay</label>
                  <input className="mono" value={cfg.hotkeys.toggleOverlay} onChange={(e) => update({ hotkeys: { ...cfg.hotkeys, toggleOverlay: e.target.value } })} />
                </div>
                <div className="field">
                  <label>Push-to-talk</label>
                  <input className="mono" value={cfg.hotkeys.pushToTalk} onChange={(e) => update({ hotkeys: { ...cfg.hotkeys, pushToTalk: e.target.value } })} />
                </div>
                <div className="field">
                  <label>Snip region</label>
                  <input className="mono" value={cfg.hotkeys.snip} onChange={(e) => update({ hotkeys: { ...cfg.hotkeys, snip: e.target.value } })} />
                </div>
              </div>
              {failedKeys.length > 0 && (
                <div className="conflict"><WarnIcon /> In use by another app: <b>{failedKeys.join(', ')}</b> — pick a different binding.</div>
              )}
            </div>
          )}

          {section === 'general' && (
            <div className="section">
              <div className="sectionTitle">General</div>
              <div className="row2">
                <div className="field">
                  <label>Microphone</label>
                  <select value={cfg.micDeviceId ?? ''} onChange={(e) => update({ micDeviceId: e.target.value || null })}>
                    <option value="">System default</option>
                    {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Accent color</label>
                  <select value={cfg.accent} onChange={(e) => update({ accent: e.target.value as 'blue' | 'green' })}>
                    <option value="blue">Blue</option>
                    <option value="green">Green</option>
                  </select>
                </div>
              </div>
              <div className="switchRow" onClick={() => update({ launchAtStartup: !cfg.launchAtStartup })}>
                <span className={`switch${cfg.launchAtStartup ? ' on' : ''}`}><span className="knob" /></span>
                <span className="switchLabel">Launch Sam when Windows starts</span>
              </div>
            </div>
          )}

          {section === 'apps' && (
            <div className="section">
              <div className="sectionHeadRow">
                <span className="sectionTitle">Custom apps</span>
                <button className="btnSoft" onClick={() => update({ customApps: [...cfg.customApps, { name: '', path: '' }] })}>
                  <PlusIcon /> Add
                </button>
              </div>
              <p className="note">Apps not in the Start Menu — the name is what you'll say ("open spotify"), the path points at the .exe.</p>
              {cfg.customApps.length === 0 && <p className="note">None yet.</p>}
              {cfg.customApps.map((a, i) => (
                <div className="listRow" key={i}>
                  <input className="name" placeholder="spotify" value={a.name} onChange={(e) => {
                    const next = [...cfg.customApps]; next[i] = { ...next[i], name: e.target.value }; update({ customApps: next })
                  }} />
                  <input className="path mono" placeholder="C:\…\Spotify.exe" value={a.path} onChange={(e) => {
                    const next = [...cfg.customApps]; next[i] = { ...next[i], path: e.target.value }; update({ customApps: next })
                  }} />
                  <button className="iconGhost" onClick={() => update({ customApps: cfg.customApps.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
            </div>
          )}

          {section === 'sessions' && (
            <div className="section">
              <div className="sectionTitle">Sessions</div>
              {Object.keys(sessions).length === 0 && <p className="note">None saved. Say "save this as work mode".</p>}
              {Object.entries(sessions).map(([name, s]) => (
                <div className="sessRow" key={name}>
                  <span className="sessName">{name} <span className="sessMeta">· {s.apps.length} apps, {s.tabs.flat().length} tabs</span></span>
                  <button className="btnOutline" onClick={() => startEdit(name)}>Edit</button>
                  <button className="btnDanger" onClick={() => void del(name)}>Delete</button>
                </div>
              ))}
              {editing && (
                <div className="field">
                  <label>Editing "{editing}" (JSON: apps + tabs)</label>
                  <textarea className="mono" value={editText} onChange={(e) => setEditText(e.target.value)} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => void saveEdit()}>Save session</button>
                    <button className="btnOutline" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="footer">
        <button className="btn" onClick={() => void save()}>Save</button>
        {msg && <span className={msg === 'Saved' ? 'ok' : 'err'}>{msg}</span>}
      </div>
    </div>
  )
}
