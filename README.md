# Sam — Desktop AI Assistant

A hidden-by-default, always-on-top overlay assistant for Windows. Summon it with a
global hotkey to type or speak. Sam can open apps by voice/text command, answer
questions about a snipped region of your screen, and save/restore "sessions" —
named combos of apps + browser tab groups for a workflow.

- **Alt+Space** — show/hide the type box
- **Alt+S** — voice input (auto-stops on silence)
- **Alt+Q** — region snip → ask a question about it

AI is served by Groq (Whisper STT + Llama for intent/chat, free tier) with OpenAI
`gpt-4o-mini` for screen-snip vision and as a fallback provider.

## Project structure

```
src/
  shared/types.ts        Shared TypeScript types (config, sessions, intents, IPC events)
  main/                  Electron main process (Node) — all OS integration
    index.ts             App entry: creates windows, registers hotkeys, wires IPC
    windows.ts           BrowserWindow factories: overlay, snip, settings
    hotkeys.ts           Global shortcut registration + conflict reporting
    ipc.ts               IPC handlers + the submit→intent→action pipeline
    config.ts            Load/save config.json (API keys, hotkeys, custom apps)
    appIndex.ts          Index Start Menu/UWP apps + fuzzy name matching + cache
    launcher.ts          Launch apps by AppID (shell) or custom .exe path
    processes.ts         List visible-window processes (for session capture)
    chrome.ts            Chrome DevTools Protocol: read open tabs, open tab groups
    sessions.ts          Session store + capture-current / open-session logic
    capture.ts           Full-screen screenshot for the snip flow
    history.ts           Rolling chat history
    ai/
      sse.ts             Server-sent-events stream parser
      groq.ts            Groq client: chat, streaming chat, Whisper transcription
      openai.ts          OpenAI client: chat, streaming, vision
      intent.ts          Tool schemas + intent extraction from a message
      router.ts          Provider fallback, retry, idle-timeout
  preload/index.ts       contextBridge exposing a safe IPC surface to renderers
  renderer/
    overlay/             The pill/panel UI: typing, voice (VAD), responses, toasts
    snip/                Fullscreen crosshair region selector
    settings/            API keys, hotkeys, mic, custom apps, session editor
tests/                   Vitest unit tests for the pure main-process logic
docs/SMOKE.md            Manual smoke checklist for OS-glue that can't be unit-tested
```

## Run

Requires Node 20+ and Windows.

```
npm install
npm run dev      # launch in development (electron-vite)
npm test         # run unit tests (vitest)
npm run dist     # build a Windows installer (electron-builder)
```

Add your Groq and OpenAI API keys in Settings (⚙ in the expanded overlay) before
using AI features.

## To implement

- [ ] Task 21: packaging + full smoke-checklist pass (`docs/SMOKE.md`)
- [ ] Wake-word activation ("Hey Sam") as an alternative to push-to-talk
- [ ] More command verbs (close app, type/paste text, web search)
- [ ] Window position/layout restore inside sessions
- [ ] Per-user VAD tuning (silence threshold/duration as settings)
- [ ] Cross-platform (macOS/Linux) support
