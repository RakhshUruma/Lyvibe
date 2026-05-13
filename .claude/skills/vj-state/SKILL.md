---
name: vj-state
description: Read the current live mood/lyrics state from the running VJ Lyrics app. Use when the user asks to inspect, modify, or reason about what is currently playing.
---

# vj-state — read the running app's current mood + lyrics

The VJ Lyrics browser app auto-pushes its current state to the relay
server every second. The relay writes three files under `.state/`:

- `.state/current-mood.json`   — the active mood JSON (typography, bg, motion, scene, …)
- `.state/current-lyrics.json` — the active lyrics segments
- `.state/current-meta.json`   — preset key, intensity, audio filename, playback time

## How to use

1. Read the file(s) you need with the Read tool. Paths are relative to
   the project root (`F:\OneDrive\ClaudeCode\▶Cowork\▶ScratchIdea\VJ Lyrics`).
2. Each file is wrapped in `{ "updatedAt": ISO_TIMESTAMP, "mood"|"lyrics"|... : ... }`.
   If `updatedAt` is older than ~10 seconds the app may not be running or the
   relay may be down — tell the user.
3. If the files don't exist: the user hasn't started the app yet, or the
   relay isn't running. Tell them to launch `start.bat` and try again.

## Modifying mood from this side

To push a new mood back into the running app:

```
POST http://localhost:8787/sync
content-type: application/json
{ "mood": { ... } }
```

The browser polls and… wait, no — the browser is the source of truth right
now. To change the live mood from here, the user has to paste the JSON into
the "Paste mood JSON" textarea and click APPLY. (A future round-trip is
possible — see the readme.)

## Quick recipes

- **"What's the current vibe?"** → Read `.state/current-meta.json`, report
  `moodKey` and audio filename + duration.
- **"Tweak the accent to red"** → Read `.state/current-mood.json`, edit, write
  the edited JSON to a temp file, tell the user to drag-drop it onto the
  Paste-mood textarea (or paste via Ctrl+V).
- **"Show me the lyrics"** → Read `.state/current-lyrics.json` and print the
  `segments` array. Note timestamps are seconds.
