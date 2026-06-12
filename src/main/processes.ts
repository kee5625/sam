import { execFile } from 'child_process'

export interface VisibleProcess {
  name: string
  title: string
}

const NOISE = new Set([
  'explorer', 'textinputhost', 'applicationframehost', 'systemsettings',
  'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'sam', 'electron'
])

export function parseVisibleProcesses(json: string): VisibleProcess[] {
  try {
    const data = JSON.parse(json)
    const arr = Array.isArray(data) ? data : [data]
    const seen = new Set<string>()
    const out: VisibleProcess[] = []
    for (const p of arr) {
      if (!p || typeof p.Name !== 'string') continue
      const key = p.Name.toLowerCase()
      if (NOISE.has(key) || seen.has(key)) continue
      seen.add(key)
      out.push({ name: p.Name, title: String(p.MainWindowTitle ?? '') })
    }
    return out
  } catch {
    return []
  }
}

export function listVisibleApps(): Promise<VisibleProcess[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Name, MainWindowTitle | ConvertTo-Json -Compress"
      ],
      { maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve([])
        resolve(parseVisibleProcesses(stdout))
      }
    )
  })
}
