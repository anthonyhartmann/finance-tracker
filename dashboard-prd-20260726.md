# Cline Agent Dashboard — PRD

> **Document:** Product Requirements Document
> **Date:** 2026-07-26
> **Version:** v1.0
> **Status:** Draft

---

## 1. Executive Summary

The Cline Agent Dashboard is a lightweight, single-process local web dashboard that displays all Cline CLI sessions in a browser. It runs alongside the existing hub-daemon on the user's machine, reading session data to provide a real-time overview of running, completed, failed, and idle agent sessions. The user can open any session to resume it directly from the browser.

**Why not built-in?** Cline ships with Kanban (`npx kanban`) for parallel agents and a TUI, but neither provides a persistent web dashboard for viewing session history, status, and project context at a glance. No community packages exist for this either.

---

## 2. Problem Statement

The user runs Cline CLI extensively (50+ sessions across 24 hours). Sessions may be running in the background (via `--zen`), completed, failed, or idle. Currently there is no way to:

- See all sessions in one place with live status
- Quickly identify which sessions are stalled or running
- Filter out trivial ad-hoc queries ("test", "exit", single words)
- Resume a past session by clicking a button
- View session metadata (project, model, duration, cost) at a glance


## 3. Goals — In Scope (v1)

| Goal | Priority |
|------|----------|
| Display all root sessions (not sub-agents) in a browser table | P0 |
| Live status badges: running (green), idle (yellow), completed (gray), failed (red), stale (orange) | P0 |
| Stale detection via `kill -0 <pid>` | P0 |
| **Chat panel:** click a session → view conversation history in real-time | P0 |
| **Send messages:** type in browser, agent responds in the same session | P0 |
| "Open" button — runs `cline --id <sessionId> -c <cwd>` as fallback | P1 |
| Session metadata: title/prompt, project path, model, start time, duration, cost | P1 |
| Toggle to hide trivial one-word sessions | P2 |
| Sortable columns (by status, start time, project) | P2 |

## 4. Goals — Out of Scope (v1)

- Desktop notifications (v2)
- Charts or analytics (v2)
- Auth or multi-user (never — local only)
- Mobile layout (desktop only)

## 5. UI Framework

**Install, don't build.** The frontend uses existing libraries loaded via CDN — zero build step, zero npm dependencies.

| Library | Purpose | CDN |
|---------|---------|-----|
| **Pico CSS** | Base styling (classless, dark mode, components) | `https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css` |
| **Alpine.js** | Lightweight reactivity (tab switching, toggles, message streaming) | `https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js` |

**Why Pico CSS?** Classless — add the `<link>` and plain HTML looks great. Tables, cards, nav, forms, and modals all styled out of the box. Dark mode via `data-theme="dark"`.

**Why Alpine.js?** 15KB. Handles the chat panel's message list, tab switching between dashboard and chat, and the "hide trivial" toggle without React/Vue build tooling. Pure HTML directives (`x-data`, `x-show`, `x-for`).

**Why not Tailwind/shadcn?** Tailwind requires a build step or a massive CDN payload. shadcn/ui requires React + build. We want single-file, zero-build, copy-paste deployment.

Before building, we surveyed the ecosystem for existing solutions:

| Source | Result |
|--------|--------|
| `npm search cline dashboard` | No packages found. The `cline-dashboard` package does not exist. |
| `npm search agent dashboard` | No relevant results for Cline/agent session dashboards. |
| Cline GitHub repo & docs | No built-in dashboard mentioned. The project has Kanban (task board) and TUI but no session history viewer. |
| `@cline/core` SDK | ✅ Has `HubUIClient` class with `listSessions()` and `subscribeUI()` — this is the **official** way to build hub-connected UIs, used internally by the menu bar app and VS Code extension. |
| Open source ecosystem | No pre-built dashboard for Cline exists. This is a common need for agentic developers but remains unsolved by existing tools. |

**Decision:** Build our own dashboard, leveraging `@cline/core`'s `HubUIClient` for the hub connection layer — no raw WebSocket protocol work needed.

## 6. User Flows

### 6.1 Open Dashboard

1. Run `node dashboard.js` in a terminal
2. Dashboard starts on `http://localhost:<port>`, logs the URL
3. Open URL in a browser tab — table populates immediately
4. Real-time updates arrive via SSE as sessions change

### 6.2 Scan Sessions

1. Table columns: Status, Title, Project, Model, Started, Duration, Cost, Actions
2. Color-coded badges for instant visual scanning
3. Running sessions sort to top
4. "Hide trivial" toggle collapses one-word prompts

### 6.3 Chat with a Session

1. User clicks any session row → chat panel opens (side drawer or modal)
2. Dashboard loads conversation history from `~/.cline/data/sessions/<id>/<id>.messages.json`
3. Messages render with role badges (user / assistant / tool)
4. User types in the input box and hits Enter
5. Dashboard sends the message to the hub via `HubSessionClient`
6. Agent processes the message and streams the response back
7. New messages appear in real-time via SSE push
8. If hub send is unavailable, "Open in Terminal" button is shown as fallback

### 6.4 Resume Session (Fallback)

1. Find the session → click "Open in Terminal"
2. Action: `cline --id <sessionId> -c <cwd>` (confirmed in CLI docs)
3. Terminal opens with the session active; user types there

### 6.5 Identify Stale Sessions

1. A "running" session that died (hub didn't notice)
2. Dashboard runs `kill -0 <pid>` — non-zero exit → mark as "stale" (orange)
3. User can click to open in terminal or ignore



## 7. Data Source Analysis

### Approach A: `cline history --json` (Original Plan)

- **Works in this env?** ❌ No — CLI binary always tries to bind port 25463, which the running hub already holds
- **Env vars tested:** `CLINE_HUB_ADDRESS`, `CLINE_SESSION_BACKEND_MODE` — binary still binds to `127.0.0.1:25463`
- **Verdict:** Blocked. Not viable without killing the hub daemon.

### Approach B: SQLite `sessions.db`

- **Path:** `~/.cline/data/db/sessions.db`
- **Access:** via `sqlite3` CLI (pre-installed on macOS) — zero npm dependencies
- **Schema:** Rich, well-structured. Columns for all needed data.
- **Verdict:** Viable fallback, but requires subprocess spawning per query. No push updates.

### Approach C: `@cline/core` HubUIClient ✅ (Recommended)

- **What it is:** The official TypeScript client library for the Cline hub daemon's WebSocket protocol. Already installed as a dependency of the `cline` CLI at `~/.asdf/.../node_modules/@cline/core/`.
- **Connect:** `new HubUIClient({ address, authToken })` — reads auth token from `~/.cline/data/locks/hub/production.json`
- **List sessions:** `client.listSessions(limit)` — returns `SessionRecord[]` with all metadata
- **Push updates:** `client.subscribeUI({ onSessionCreated, onSessionUpdated, onSessionDetached })` — real-time without polling
- **Verified:** ✅ Tested successfully — connects in <100ms, returns 45 sessions with full metadata, registers as a named client
- **Zero dependencies:** Already installed globally; we just `require()` from the existing path

### Recommendation

**Use `HubUIClient` from `@cline/core` for v1.** No polling needed — push updates give real-time session tracking. No npm install needed. Reliable, official, supported.

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cline upgrades break `@cline/core` API | Low | Pin to the currently installed version; exports are stable |
| Hub lock file moves/renames | Very Low | Fall back to probing hub with common paths |
| Hub auth token changes | Low | Re-read lock file on reconnect |
| WebSocket disconnects | Low | `HubUIClient` has built-in reconnect logic |
| Sandbox blocks WebSocket | Very Low | Loopback connections are unrestricted |


## 10. Architecture Overview

```
Browser Tab (Pico CSS + Alpine.js)
  +-- Session list table  ←── GET /api/sessions + SSE /api/events
  +-- Chat panel          ←── GET /api/messages/:id + SSE /api/events
  |     +-- message history (read from .messages.json)
  |     +-- input box     →── POST /api/send/:id
  |     +-- real-time stream (new messages pushed via SSE)
  |
  |      HTTP (localhost)
      v
node dashboard.js
  +-- HubUIClient    ──WebSocket──▶  hub-daemon (:25463)
  |     ├─ listSessions()           (session list + metadata)
  |     ├─ subscribeUI()  ──▶  SSE broadcast
  |     └─ listClients()
  |
  +-- HubSessionClient ──WebSocket──▶  hub-daemon (:25463)
  |     ├─ readMessages()           (conversation history)
  |     ├─ sendRuntimeSession()     (send user message)
  |     └─ streamEvents()           (real-time responses)
  |
  +-- fs.watch() on ~/.cline/data/sessions/*/*.messages.json
  |     (fallback for message streaming if hub events miss)
  |
  +-- HTTP Server (node:http)
        ├─ GET /                  → 200 index.html
        ├─ GET /api/sessions      → 200 [{session}, …]
        ├─ GET /api/events        → 200 SSE stream
        ├─ GET /api/messages/:id  → 200 { messages: [...] }
        ├─ POST /api/send/:id     → 200 (send message to session)
        └─ POST /api/open/:id     → 200 (opens terminal)

~/.cline/data/locks/hub/production.json  ← auth token
cline hub-daemon (PID 79391)
  +-- session state (SQLite + in-memory)
  +-- pushes events to all subscribers
  +-- writes messages to ~/.cline/data/sessions/<id>/<id>.messages.json
```


## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Dashboard loads <500ms | 50 sessions rendered |
| Push update latency | <100ms from hub event to UI update |
| Memory | <30 MB RSS |
| Uncaught exceptions | Zero |
| Hub WebSocket uptime | Auto-reconnect on disconnect |
