import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SamConfig } from '../shared/types'

export const DEFAULT_CONFIG: SamConfig = {
  groqApiKey: '',
  openaiApiKey: '',
  hotkeys: { toggleOverlay: 'Alt+Space', pushToTalk: 'Alt+S', snip: 'Alt+Q' },
  launchAtStartup: false,
  micDeviceId: null,
  customApps: [],
  accent: 'blue',
  theme: 'dark'
}

export class ConfigStore {
  private file: string

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'config.json')
  }

  load(): SamConfig {
    if (!existsSync(this.file)) return { ...DEFAULT_CONFIG }
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'))
      return {
        ...DEFAULT_CONFIG,
        ...raw,
        hotkeys: { ...DEFAULT_CONFIG.hotkeys, ...(raw.hotkeys ?? {}) },
        customApps: Array.isArray(raw.customApps) ? raw.customApps : []
      }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  save(cfg: SamConfig): void {
    writeFileSync(this.file, JSON.stringify(cfg, null, 2))
  }
}
