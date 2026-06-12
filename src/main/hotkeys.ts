import { globalShortcut } from 'electron'

export interface HotkeyHandlers {
  toggleOverlay: () => void
  pushToTalk: () => void
  snip: () => void
}

/**
 * Registers all hotkeys. Returns accelerator strings that failed
 * (already taken by another app) so settings can flag them.
 */
export function registerHotkeys(
  bindings: { toggleOverlay: string; pushToTalk: string; snip: string },
  handlers: HotkeyHandlers
): string[] {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  const entries: [string, () => void][] = [
    [bindings.toggleOverlay, handlers.toggleOverlay],
    [bindings.pushToTalk, handlers.pushToTalk],
    [bindings.snip, handlers.snip]
  ]
  for (const [accel, handler] of entries) {
    try {
      if (!globalShortcut.register(accel, handler)) failed.push(accel)
    } catch {
      failed.push(accel)
    }
  }
  return failed
}
