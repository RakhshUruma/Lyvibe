# VJ Lyrics — v1.1 (2026.05)

Real-time lyric VJ for browser. ASR (gpt-4o-transcribe / Gemini 2.5 Pro Files API / AssemblyAI) → editable per-line lyrics → LLM-generated mood (Anthropic with prompt cache + extended thinking + streaming, Gemini, or local `claude -p` relay) → animated stage → webm export.

## Quick start

```sh
cp .env.example .env       # fill in keys
npm install
npm run dev                # vite on http://127.0.0.1:5173

# in another terminal — optional
npm run relay              # MCP + HTTP shim on http://127.0.0.1:8787
```

## Stack

| layer       | tech                                                |
| ----------- | --------------------------------------------------- |
| UI          | vanilla TS + Vite (no framework)                    |
| Mood gen    | `@anthropic-ai/sdk` (cache + thinking + stream), `@google/generative-ai`, local relay |
| ASR         | `openai` (gpt-4o-transcribe), Gemini Files API REST, AssemblyAI |
| Storage     | IndexedDB via `idb`                                 |
| Export      | `MediaRecorder` + `canvas.captureStream`; `@ffmpeg/ffmpeg` for mp4 (lazy) |
| MCP         | `@modelcontextprotocol/sdk` (stdio + HTTP shim)     |

## Architecture

```
audio ─▶ ASR dispatcher ─▶ Lyrics ─▶ Editor ─▶ Mood dispatcher ─▶ Stage ─▶ Export
            │                  │                      │
            │                 IDB                  presets
            │
            ├─ openai (gpt-4o-transcribe, ≤25MB inline)
            ├─ gemini (Files API auto-promote >18MB)
            └─ assemblyai (universal)

           ┌─────────────────────────┐
           │ relay/vj-mcp.ts         │  ← Claude Code  (`claude mcp add ...`)
           │   stdio MCP             │  ← Claude Desktop
           │   + HTTP shim :8787     │  ← Cursor
           │   + `claude -p` bridge  │  ← browser fallback
           └─────────────────────────┘
```

## Modern features wired in (per spec §1)

- **Prompt caching** on the long mood system prompt (Anthropic `cache_control: ephemeral`).
- **Extended thinking** auto-enabled when vibe > 200 chars or ≥5 distinct keywords (`budget_tokens=2048`).
- **Streaming** mood generation; partial preview pushed to UI.
- **Files API** auto-promotion when audio > `VITE_USE_FILES_API_THRESHOLD_MB` (default 18).
- **JSON Schema enforcement** on Gemini side (`responseSchema` + `responseMimeType: application/json`).
- **MCP** server is core, not afterthought: `generate_mood` / `validate_mood` / `list_presets` / `remix` / `subscription_call`.

## MCP install

```sh
claude mcp add vj-lyrics --command "node --import tsx /abs/path/to/relay/vj-mcp.ts"
```

Then in Claude Code:

```
/mcp vj-lyrics generate_mood vibe="horror heartbeat"
```

## Skill

The standalone `skill/SKILL.md` works in any Skill-aware Claude environment:

```
/vj-lyrics-mood horror heartbeat
```

## Env

See `.env.example`. Browser-side reads only `VITE_*` vars (Vite convention). `relay/vj-mcp.ts` reads server-only `ANTHROPIC_API_KEY`.

## Hotkeys

| key         | action                          |
| ----------- | ------------------------------- |
| `Space`     | play / pause                    |
| `E`         | open lyric editor (auto-pause)  |
| `Esc`       | close editor                    |
| `Ctrl+Enter`| apply edit                      |

## Receipt vs spec (v1.1 §9 acceptance)

- [x] `.env` defaults to `gpt-4o-transcribe`, `claude-sonnet-4-6`, `gemini-2.5-pro`
- [x] Files API auto-route at >18MB
- [x] Pause → editor → Apply
- [x] Anthropic cache + thinking + streaming wired
- [x] Failure cascade: anthropic → relay → gemini, status reported in plain text
- [x] webm export via `MediaRecorder` (mp4 lazy via ffmpeg.wasm)
- [x] MCP `generate_mood` callable from Claude Code
- [x] Skill `/vj-lyrics-mood` returns JSON
- [x] No API keys in UI / no localStorage persistence

## Out of scope

- Cloud sync / accounts
- Mobile-optimized UI
- Multilingual UI strings
- Per-section auto mood-switching (post-v1.1)
- 4K export (post-v1.2)
