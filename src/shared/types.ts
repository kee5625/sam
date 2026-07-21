export interface SamConfig {
  groqApiKey: string
  openaiApiKey: string
  hotkeys: { toggleOverlay: string; pushToTalk: string; snip: string }
  launchAtStartup: boolean
  micDeviceId: string | null
  /** Apps not in the Start Menu index — launched directly by exe path */
  customApps: { name: string; path: string }[]
  /** Overlay accent color */
  accent: 'blue' | 'green'
}

export interface AppEntry {
  name: string
  appId: string
}

export interface Session {
  apps: string[]
  tabs: string[][]
  created: string
  lastUsed: string
}

export type Intent =
  | { type: 'open_app'; name: string }
  | { type: 'open_urls'; urls: string[] }
  | { type: 'open_session'; name: string }
  | { type: 'save_session'; name: string }
  | { type: 'answer' }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Events streamed main -> overlay renderer */
export type AssistantEvent =
  | { kind: 'status'; text: string }
  | { kind: 'token'; text: string }
  | { kind: 'done' }
  | { kind: 'error'; text: string; retryable: boolean }
  | { kind: 'result'; text: string }
  | { kind: 'suggestions'; query: string; apps: AppEntry[] }
  | { kind: 'confirm-save'; name: string; apps: string[]; tabs: string[][]; warning?: string }
  | { kind: 'transcript'; text: string }
  | { kind: 'open-view'; view: 'todo' }
