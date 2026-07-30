# Cline Agent Dashboard

A lightweight, single-process local web dashboard that shows all your Cline CLI
sessions in a browser — live status, conversation history, and one-click resume.

It runs alongside the existing `hub-daemon`, reading session data via the
official `@cline/core` WebSocket clients (`HubUIClient` + `HubSessionClient`).
No npm dependencies, no build step.

## Quick start

```bash
node ~/.cline/dashboard/dashboard.js
# → listening on http://127.0.0.1:25464/
```

Then open **http://127.0.0.1:25464/** in your browser.

### Options

| Env    | Default | Description                          |
|--------|---------|--------------------------------------|
| `PORT` | `25464` | HTTP port to listen on (localhost)   |

## What it does

- **Session table** — every root session with status badge (running/idle/
  completed/failed/stale), title, project, model, start time, and cost.
- **Stale detection** — `kill(pid, 0)` probes liveness; a “running” session
  whose process is dead shows an orange **stale** badge.
- **Chat panel** — click any row to read its full `.messages.json` history,
  rendered as a conversation. New messages stream in via SSE.
- **Send messages** — type in the chat panel to send to a *running* session via
  `HubSessionClient.sendRuntimeSession()`. If the session can’t accept it
  (failed/completed), the UI falls back to “Open in Terminal”.
- **Open in Terminal** — resumes the session with `cline --id <id>` in a new
  Terminal window at the session’s cwd (macOS).
- **Real-time** — `HubUIClient.subscribeUI()` events are pushed to the browser
  via Server-Sent Events; a polling fallback kicks in if SSE drops.
- **Polish** — “Hide trivial” filter, dark-mode toggle, relative timestamps,
  all persisted to `localStorage`.

## Files

| File           | Purpose                                              |
|----------------|------------------------------------------------------|
| `dashboard.js` | Main server — Node stdlib only, single file          |
| `index.html`   | Frontend — Pico CSS + Alpine.js (via CDN)            |
| `probe.js`     | M1 verification script (connects, lists, reads)      |
| `launch.py`    | Helper to start the server fully detached            |

## API

| Method | Path                 | Description                         |
|--------|----------------------|-------------------------------------|
| GET    | `/`                  | `index.html`                        |
| GET    | `/api/sessions`      | sorted root sessions (JSON)         |
| GET    | `/api/events`        | SSE stream (real-time push)         |
| GET    | `/api/messages/:id`  | `{ messages: [...] }`               |
| POST   | `/api/send/:id`      | `{ text }` → send to running session|
| POST   | `/api/open/:id`      | open Terminal with `cline --id`     |

## Requirements

- Node.js 22+
- The `cline` CLI installed (provides `@cline/core`)
- The hub daemon running (`~/.cline/data/locks/hub/production.json` present)

## Limitations (v1)

- `@cline/core` path is probed from common asdf/global locations; pinned to the
  current Cline install.
- “Open in Terminal” uses `osascript` — macOS only.
- Sending only works for sessions the hub still owns as a running runtime;
  otherwise the UI degrades to the terminal fallback.
