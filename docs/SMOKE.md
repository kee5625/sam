# Sam — Manual Smoke Checklist

Run after any change to OS glue (hotkeys, windows, capture, mic). `npm run dev` or installed build.

## Overlay
- [x] Pill appears top-center, above all windows (test over a fullscreen video)
- [x] When idle, clicks pass through to apps underneath
- [x] Alt+Space expands; input is focused; Esc collapses
- [x] Streams a chat answer for "explain closures in js" (markdown rendered)

## Voice
- [x] Alt+S starts recording (red pulsing dot), Alt+S again stops
- [x] Spoken "open calculator" → transcript appears → Calculator launches
- [ ] Unplugging/denying mic shows error toast; typing still works

## Commands
- [ ] "open spotify" launches Spotify
- [ ] "open spotty" (typo) shows 3 suggestions; clicking one launches it
- [ ] "open leetcode.com and neetcode.io" opens both in one Chrome window

## Sessions
- [ ] With Chrome opened BY SAM: "save this as test mode" lists apps + tabs, Save persists
- [ ] With Chrome opened manually (no debug port): save warns "apps only"
- [ ] "open test mode" launches missing apps + tabs; already-running apps not duplicated
- [ ] Settings window lists/edits/deletes sessions

## Snip
- [ ] Alt+Q freezes screen; drag selects; thumbnail lands in overlay
- [ ] Question about snip gets a correct vision answer
- [ ] Esc cancels snip cleanly (overlay still works after)
- [ ] Follow-up question still references the attached snip; ✕ clear detaches it

## Errors
- [ ] Blank Groq key: any command shows "open settings" prompt
- [ ] Bad Groq key + valid OpenAI key: chat still answers (fallback)
- [ ] Hotkey conflict shows red warning in settings

## Packaging
- [ ] `npm run dist` produces installer in `dist/`; installed app passes Overlay + Commands sections
- [ ] "Launch at startup" checkbox survives reboot
