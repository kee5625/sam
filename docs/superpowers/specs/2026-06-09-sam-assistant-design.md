# Sam — Desktop AI Assistant: Design Spec

**Date:** 2026-06-09
**Status:** Approved by user (brainstorming session)
**Target:** Personal tool, Windows 11 only, single user

## Overview

Sam is an always-available desktop AI assistant for Windows. It lives as a translucent
pill-bar overlay at the top of the screen (Cluely-style), summoned by global hotkeys.
It can:

1. Open apps via voice or typed commands ("open spotify")
2. Answer questions about anything on screen via region snip + vision model
3. Save and restore named "sessions" — combos of apps + Chrome tab groups for workflows
4. Open browser tabs on command
5. Act as a general chat assistant in the overlay

## Stack

- **Electron + TypeScript + React + Vite** — chosen over Tauri (Windows overlay/capture
  plugin gaps) and Python (UI polish, packaging)
- **Groq API (free tier):**
  - `whisper-large-v3-turbo` — speech-to-text
  - `llama-3.3-70b-versatile` — intent parsing (function calling) + general chat
- **OpenAI API (`gpt-4o-mini`):** vision Q&A only (screen snips); also fallback intent/chat
  provider if Groq is unreachable
- **Storage:** JSON files in `%APPDATA%/sam/`

## Architecture

```
Main process (Node)
 ├─ Hotkey manager       — Electron globalShortcut
 ├─ App launcher         — Start Menu .lnk index + Get-StartApps (UWP), fuzzy match, spawn
 ├─ Session store        — sessions.json CRUD
 ├─ Chrome bridge        — Chrome DevTools Protocol (read tabs), shell launch (open tabs)
 ├─ AI router            — Groq/OpenAI clients, fallback + timeout logic
 └─ Screen capture       — desktopCapturer full-screen grab for snip

Renderer windows
 1. Overlay  — frameless, transparent, always-on-top, top-center pill bar.
               Click-through when idle (setIgnoreMouseEvents). Hosts mic capture.
 2. Snip     — on-demand fullscreen transparent window showing frozen screenshot,
               crosshair drag-to-crop.
 3. Settings — normal window: API keys, hotkey editor, session editor,
               startup toggle, mic device picker.
```

### Hotkeys (defaults, user-editable)

| Hotkey | Action |
|--------|--------|
| `Alt+Space` | Toggle overlay expanded/collapsed |
| `Alt+S` | Push-to-talk (hold = release stops; tap = toggle) |
| `Alt+Q` | Region snip + ask |

### Intent parsing

Every user input (typed or transcribed) goes to Llama with function-calling tools:

- `open_app(name)`
- `open_urls(urls[])`
- `open_session(name)`
- `save_session(name)`
- `answer()` — plain chat response

One round-trip decides command vs. question. Parser receives last 6 conversation turns
for contextual references ("open that site again").

## Core flows

### Overlay states

1. **Idle pill** — tiny status dot + mic icon, click-through, never steals focus
2. **Expanded** — input box focused; response panel below, max 40% screen height,
   scrollable, markdown rendered, token streaming
3. **Listening** — pill pulses red during recording, live indicator while transcribing
4. Esc or click-outside collapses to pill

### Voice

```
hold Alt+S → record mic (webm/opus) → release → Groq Whisper →
transcript shown in overlay → intent parser → tool call or chat answer
```

### Snip + ask

```
Alt+Q → fullscreen frozen screenshot → drag rectangle → crop →
overlay expands with thumbnail → type or speak question →
gpt-4o-mini vision → streamed answer
```

Esc cancels. Snipped image stays attached for follow-ups until cleared.

### App launching

- Startup: index Start Menu `.lnk` files + UWP apps (`Get-StartApps`) into a
  name→launch-target map. Cached in `app-index.json`, refreshed daily.
- `open_app("spotify")` → fuzzy match against index → spawn.
- No match → overlay reports failure, offers 3 closest matches (click to launch).

### Chrome bridge

- Sam launches Chrome with `--remote-debugging-port=9222` whenever it opens tabs/sessions.
- **Save-session tab capture:** read open tabs via CDP `/json/list`. If Chrome is running
  without the debug port, tabs are unreadable → fall back to capturing apps only, warn in
  overlay.
- **Opening tabs:** always works via shell (`start chrome url1 url2 ...` per tab group,
  one new window per group).

## Sessions & data

### `sessions.json`

```json
{
  "leetcode mode": {
    "apps": ["code", "spotify"],
    "tabs": [["https://leetcode.com/problems", "https://neetcode.io"]],
    "created": "2026-06-09T00:00:00Z",
    "lastUsed": "2026-06-09T00:00:00Z"
  }
}
```

- `tabs` = array of tab groups; each group opens as one Chrome window
- **Open:** launch apps not already running + open tab groups
- **Save ("save this as X"):** capture running user-facing apps (filter: process has a
  visible window) + CDP tabs → show captured list in overlay for confirmation before save
- Full session CRUD also available in the settings window

### Other storage (all under `%APPDATA%/sam/`)

| File | Contents |
|------|----------|
| `config.json` | API keys, hotkey bindings, launch-at-startup, mic device |
| `history.json` | Rolling chat history (last 50 messages also kept in memory) |
| `app-index.json` | Cached app name→target index |
| `sessions.json` | Saved sessions |

## Error handling

- **Missing/invalid API key** → overlay shows setup prompt linking to settings
- **Groq down/rate-limited** → retry once → error chip ("Groq unreachable — retry?");
  if OpenAI key present, intent/chat falls back to `gpt-4o-mini`
- **Mic denied/missing** → toast with fix instructions; voice disabled, typing unaffected
- **App match failure** → top-3 fuzzy suggestions
- **Chrome tabs unreadable** → save apps only + warn
- **Hotkey registration conflict** → flagged red in settings, prompt to rebind
- **All AI calls:** 30 s timeout, cancellable mid-stream with Esc

## Testing

- **Unit (Vitest):** intent-parser tool schemas, fuzzy app matching, session store CRUD,
  CDP tab-list parsing — mocked APIs throughout
- **Integration:** AI router fallback logic; session open/save round-trip against a fake
  process list
- **Manual smoke checklist** for OS glue (hotkeys, overlay click-through, snip overlay,
  mic capture) — documented list, run per release
- **Out of scope for v1:** Playwright Electron E2E (possible later)

## Out of scope (v1)

- macOS/Linux support (Windows-specific code kept in main-process service modules,
  but no abstraction layer built ahead of need)
- Wake-word activation (push-to-talk only)
- Window position/layout restore in sessions
- Text-selection capture (region snip covers it)
- Local/offline models
