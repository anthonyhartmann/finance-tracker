# Cline Agent Dashboard — Technical Specification

> **Document:** Technical Specification
> **Date:** 2026-07-26
> **Version:** v1.0
> **Companion:** See `dashboard-prd-20260726.md` for product requirements
> **Status:** Draft

---

## 1. Architecture

Single Node.js process with an HTTP server. Connects to the Cline hub daemon's WebSocket protocol using the official `@cline/core` `HubUIClient` (for session list + UI events) and `HubSessionClient` (for chat messaging). Serves a static HTML page styled with Pico CSS and Alpine.js.

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (tab)                             │
│  Pico CSS + Alpine.js                                       │
│    ├── Session list table  ← GET /api/sessions + SSE        │
│    └── Chat panel          ← GET /api/messages/:id + SSE    │
│          ├── message history (read from .messages.json)      │
│          ├── input box     → POST /api/send/:id             │
│          └── real-time stream (SSE push)                    │
└────────────────────────────────────────┬────────────────────┘
                                         │ HTTP
┌────────────────────────────────────────▼────────────────────┐
│              dashboard.js  (Node 22, stdlib only)            │
│                                                              │
│  HubUIClient ──WebSocket──▶ hub-daemon (:25463)              │
│    ├─ listSessions()        (session list + metadata)        │
│    ├─ subscribeUI()  ──▶  SSE broadcast to browsers          │
│    └─ listClients()                                          │
│                                                              │
│  HubSessionClient ──WebSocket──▶ hub-daemon (:25463)         │
│    ├─ readMessages(sessionId)   (conversation history)       │
│    ├─ sendRuntimeSession()      (send user message)          │
│    └─ streamEvents()            (real-time responses)        │
│                                                              │
│  fs.watch() on ~/.cline/data/sessions/*/*.messages.json      │
│    (fallback for message streaming)                          │
│                                                              │
│  HTTP Server (node:http)                                     │
│    ├─ GET /                  → 200 index.html                │
│    ├─ GET /api/sessions      → 200 [{session}, …]            │
│    ├─ GET /api/events        → 200 SSE stream                │
│    ├─ GET /api/messages/:id  → 200 { messages: [...] }      │
│    ├─ POST /api/send/:id     → 200 (send message)            │
│    └─ POST /api/open/:id     → 200 (opens terminal)          │
└─────────────────────────────────────────────────────────────┘
```

No npm dependencies for the server. No build step for the frontend. Uses:
- Node.js stdlib (`http`, `fs`, `child_process`, `path`, `url`)
- `@cline/core` (already installed as a dependency of the `cline` CLI)
- **Pico CSS** (CDN) for styling
- **Alpine.js** (CDN) for lightweight reactivity

---

## 2. Data Layer

### 2.1 Hub Connection

The Cline hub daemon exposes a WebSocket at `ws://127.0.0.1:25463/hub`.
Authentication is via bearer token stored in a lock file.

```javascript
const fs = require('fs');
const { HubUIClient } = require(CLINE_CORE_PATH);

const LOCK_PATH = join(HOME, '.cline/data/locks/hub/production.json');
const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));

const client = new HubUIClient({
  address:    lock.url,             // ws://127.0.0.1:25463/hub
  authToken:  lock.authToken,      // 64-char hex
  clientId:   'dashboard-' + Date.now(),
  clientType: 'dashboard',
  displayName: 'Agent Dashboard'
});

await client.connect();
```

**Path to `@cline/core`:**
```javascript
const CLINE_CORE_PATH = join(
  process.env.HOME,
  '.asdf/installs/nodejs/22.22.1/lib/node_modules/cline/node_modules/@cline/core/dist/index.js'
);
```

*Note: This hardcoded path is pinned to the current Cline install. A startup probe walks `node_modules/@cline/core/dist/index.js` upward from common asdf/global install locations. If not found, dashboard logs an error and exits.*

### 2.2 Session Record Shape

The `HubUIClient.listSessions()` call returns:

```typescript
{
  sessionId:      string;       // "1785085544240_dvqpd"
  workspaceRoot:  string;       // "/Users/anthonyhartmann/.cline"
  cwd:            string;       // "/Users/anthonyhartmann/.cline"
  createdAt:      number;       // epoch ms
  updatedAt:      number;       // epoch ms
  createdByClientId: string;    // "core-7yirxsj1-ms21ud0a"
  status:         string;       // "running" | "completed" | "failed" | "idle"
  participants:   Array<{ clientId, attachedAt, role }>;
  metadata: {
    source:       "cli";
    provider:     string;       // "cline-pass"
    model:        string;       // "deepseek/deepseek-v4-flash"
    mode:         "act" | "plan";
    title:        string;       // first ~80 chars of prompt
    prompt:       string;       // full raw prompt text
    totalCost:    number;       // USD, e.g. 0.0684
    pid:          number;       // OS process ID for liveness check
    usage:        { inputTokens, outputTokens, cacheReadTokens, ... }
    messagesPath: string;       // path to .messages.json file
    ...
  };
  runtimeOptions: {
    enableTools:  boolean;
    enableSpawn:  boolean;
    enableTeams:  boolean;
    mode:         string;
    systemPrompt: string;
  }
}
```

### 2.3 Push Updates via subscribeUI()

The `HubUIClient.subscribeUI()` method returns events without polling:

```javascript
const unsubscribe = client.subscribeUI({
  onSessionCreated:   (payload) => { /* add to session cache, broadcast SSE */ },
  onSessionUpdated:   (payload) => { /* update session cache, broadcast SSE */ },
  onSessionDetached:  (payload) => { /* remove/update in cache, broadcast SSE */ },
  onClientRegistered:  (payload) => { /* log new client connection */ },
  onClientDisconnected: (payload) => { /* log client disconnect */ },
});
```

Events are forwarded to connected browsers via **Server-Sent Events** (`GET /api/events`), which pushes session changes to the frontend without polling.

### 2.4 Server-Sent Events (SSE) for Browser

```javascript
// Dashboard backend (Node.js)
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive'
  });
  const id = Date.now();
  sseClients.set(id, res);
  req.on('close', () => sseClients.delete(id));
});

// When a hub event arrives:
sseClients.forEach((res) => {
  res.write('data: ' + JSON.stringify(event) + '\n\n');
});
```

### 2.5 Hub Discovery

```javascript
// Lock file locations (probed in order)
const HUB_LOCK_PATHS = [
  join(HOME, '.cline/data/locks/hub/production.json'),
  join(HOME, '.cline/data/locks/hub/staging.json'),
];
```

If no lock file is found, dashboard exits with a clear error message.

### 2.6 HubSessionClient (Chat)

For reading conversation history and sending messages, use `HubSessionClient`:

```javascript
const { HubSessionClient } = require(CLINE_CORE_PATH);

const chatClient = new HubSessionClient({
  address:    lock.url,
  authToken:  lock.authToken,
  clientId:   'dashboard-chat',
  clientType: 'dashboard'
});

await chatClient.connect();

// Read conversation history
const messages = await chatClient.readMessages(sessionId);
// messages: LlmsProviders.Message[]

// Stream real-time events
const stop = chatClient.streamEvents(
  { sessionIds: [sessionId] },
  {
    onEvent: (event) => {
      // event: { sessionId, eventType, payload }
      broadcastToSSE(event);
    },
    onError: (err) => console.error('Stream error:', err)
  }
);

// Send a message (verified during implementation)
// const result = await chatClient.sendRuntimeSession(sessionId, {
//   text: userMessage
// });
```

**Note:** `sendRuntimeSession()` availability and exact request shape will be verified during M1. If the hub does not allow external clients to send messages to an owned session, the dashboard falls back to "Open in Terminal" for message input.

### 2.7 Message File Format

When `HubSessionClient.readMessages()` is unavailable or for direct file access:

```javascript
// Path: ~/.cline/data/sessions/<sessionId>/<sessionId>.messages.json
const messagesFile = require(`/Users/.../.cline/data/sessions/${id}/${id}.messages.json`);

{
  version: 1,
  updated_at: "2026-07-26T17:32:22.451Z",
  agent: "lead",
  sessionId: "1785085544240_dvqpd",
  system_prompt: "...",
  messages: [
    {
      id: "msg_ms21vc5v_dbc",
      role: "user",        // "user" | "assistant"
      content: [
        { type: "text", text: "..." },
        { type: "tool_use", tool_use_id: "...", name: "run_commands", input: {...} },
        { type: "tool_result", tool_use_id: "...", name: "run_commands", content: [...] }
      ],
      ts: 1785085557138     // epoch ms
    }
  ]
}
```

**Message rendering rules:**
- `role: "user"` → right-aligned, blue bubble
- `role: "assistant"` → left-aligned, gray bubble
- `content[].type === "tool_use"` → collapsible tool call card (show tool name + input)
- `content[].type === "tool_result"` → collapsible tool result card (show success/fail + output)
- `content[].type === "text"` → plain text, preserve newlines

### 2.8 File Watcher Fallback

If hub events miss message updates (e.g., the session's creator client handles messages internally):

```javascript
const watchers = new Map();  // sessionId → fs.FSWatcher

function watchMessages(sessionId, onChange) {
  const path = join(SESSIONS_DIR, sessionId, `${sessionId}.messages.json`);
  if (watchers.has(sessionId)) return;
  
  const watcher = fs.watch(path, (eventType) => {
    if (eventType === 'change') {
      // Debounce: wait 100ms for write to complete
      clearTimeout(watchers.get(sessionId + '_timeout'));
      watchers.set(sessionId + '_timeout', setTimeout(() => {
        const data = JSON.parse(fs.readFileSync(path, 'utf8'));
        onChange(data.messages);
      }, 100));
    }
  });
  
  watchers.set(sessionId, watcher);
}
```

---

## 3. HTTP Server

Pure `node:http`, no Express, no framework.

### 3.1 Routes

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| GET | `/` | 200 `text/html` | Serves embedded `index.html` (Pico CSS + Alpine.js) |
| GET | `/api/sessions` | 200 `application/json` | Array of `SessionRecord` |
| GET | `/api/events` | 200 SSE stream | Real-time push (sessions + messages) |
| GET | `/api/messages/:id` | 200 `application/json` | `{ messages: [...] }` from `.messages.json` |
| POST | `/api/send/:id` | 200 | Sends user message to session via `HubSessionClient` |
| POST | `/api/open/:id` | 200 | Spawns terminal with `cline --id <id>` |
| GET | `/health` | 200 | Hub connection status |

### 3.2 Static File Serving

The `index.html` content is embedded as a JavaScript string constant in `dashboard.js` (no `fs.readFileSync` at runtime). This keeps the deployment to a single file.

Alternatively, for development, `GET /` can read from `./index.html` in the same directory.

### 3.3 Port Selection

```javascript
const PORT = parseInt(process.env.PORT || '0', 10); // 0 = random free port
```

On startup, print the URL: `Dashboard running at http://localhost:${PORT}`

---

## 4. Frontend

Single `index.html` with embedded CSS and vanilla JavaScript. No build step.

**Libraries (CDN):**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
```

### 4.1 Layout — Dashboard View

```
┌─────────────────────────────────────────────────────────────┐
│  Cline Agent Dashboard           [x] Hide trivial   Filter  │
├─────────────────────────────────────────────────────────────┤
│ ● Running (3)  ● Idle (0)  ● Completed (12)  ● Failed (8)  │
├──────┬───────────┬──────────┬──────────┬─────────┬─────────┤
│Status│  Title    │ Project  │  Model   │ Started │ Actions │
├──────┼───────────┼──────────┼──────────┼─────────┼─────────┤
│ 🟢   │ Build ... │ ~/.cline │ deep...  │ 2m ago  │ [Chat]  │
│ 🟠   │ Fix ...   │ ~/.cline │ deep...  │ 45m ago │ [Chat]  │
│ ⚪   │ exit      │ ~/.cline │ deep...  │ 1d ago  │ [Chat]  │
│ 🔴   │ migrate.. │ ~/projs  │ gemin..  │ 2d ago  │ [Chat]  │
└──────┴───────────┴──────────┴──────────┴─────────┴─────────┘
```

### 4.2 Layout — Chat Panel (Modal/Drawer)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard    Session: Build finance tracker      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🤖 Assistant                                        │   │
│  │ I'll help you build the dashboard. What would you   │   │
│  │ like to start with?                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 👤 You                                              │   │
│  │ Let me chat to the agent from this web app          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────┐                                               │
│  │ 🔧 tool_use: run_commands                               │
│  │ Input: { "commands": ["node -e ..."] }                  │
│  └──────────┘                                               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✅ tool_result: run_commands                          │   │
│  │ Output: 3.1.3                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [Type a message...                    ] [Send] [Open in □] │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Alpine.js State

```html
<div x-data="dashboard()">
  <!-- Session list -->
  <table>
    <template x-for="session in filteredSessions" :key="session.sessionId">
      <tr @click="openChat(session.sessionId)">
        <td><span :class="'badge ' + session.status" x-text="session.status"></span></td>
        <td x-text="session.title"></td>
        <td x-text="session.project"></td>
        <td x-text="session.model"></td>
        <td x-text="session.started"></td>
        <td><button @click.stop="openChat(session.sessionId)">Chat</button></td>
      </tr>
    </template>
  </table>
  
  <!-- Chat panel (modal) -->
  <dialog :open="activeChat" x-show="activeChat">
    <article>
      <header>
        <button @click="activeChat = null">← Back</button>
        <h3 x-text="chatTitle"></h3>
      </header>
      <div class="messages" x-ref="messagesContainer">
        <template x-for="msg in chatMessages" :key="msg.id">
          <div :class="'message ' + msg.role">
            <template x-for="block in msg.content" :key="block.type">
              <div x-show="block.type === 'text'" x-text="block.text"></div>
              <details x-show="block.type === 'tool_use'">
                <summary>🔧 <span x-text="block.name"></span></summary>
                <pre><code x-text="JSON.stringify(block.input, null, 2)"></code></pre>
              </details>
            </template>
          </div>
        </template>
      </div>
      <footer>
        <input x-model="chatInput" @keydown.enter="sendMessage()" placeholder="Type a message...">
        <button @click="sendMessage()">Send</button>
        <button @click="openTerminal()">Open in Terminal</button>
      </footer>
    </article>
  </dialog>
</div>
```

### 4.4 Column Definitions

| Column | Source | Format | Sortable |
|--------|--------|--------|----------|
| Status | `session.status` + PID liveness | Badge with color | Yes |
| Title | `metadata.title` or `metadata.prompt` | Truncated to ~60 chars | Yes |
| Project | `session.cwd` | Path relative to `~/` | Yes |
| Model | `metadata.model` | Provider/model string | Yes |
| Started | `session.createdAt` | Relative time ("2m ago") | Yes |
| Cost | `metadata.totalCost` | `$0.068` | Yes |
| Actions | — | Chat / Open buttons | No |

### 4.5 Status Badge Mapping

| Hub Status | Display | Color |
|------------|---------|-------|
| `running` + PID alive | `running` | `#22c55e` (green) |
| `running` + PID dead | `stale` | `#f97316` (orange) |
| `idle` | `idle` | `#eab308` (yellow) |
| `completed` | `completed` | `#6b7280` (gray) |
| `failed` | `failed` | `#ef4444` (red) |

### 4.6 SSE Client

```javascript
const events = new EventSource('/api/events');
events.onmessage = (msg) => {
  const event = JSON.parse(msg.data);
  if (event.type === 'session.created' || event.type === 'session.updated') {
    upsertSession(event.session);
  }
  if (event.type === 'session.detached') {
    markRemoved(event.sessionId);
  }
  if (event.type === 'message.new') {
    appendMessage(event.sessionId, event.message);
  }
  render();
};
```

Fallback: if SSE connection drops, fall back to polling `GET /api/sessions` every 5 seconds.

### 4.7 Chat Message Sending

```javascript
async function sendMessage(sessionId, text) {
  const res = await fetch(`/api/send/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    // Fallback: show "Open in Terminal" button
    showTerminalFallback(sessionId);
  }
}
```

### 4.8 Trivial Session Filter

A "Hide trivial" checkbox (persisted to `localStorage`) suppresses sessions whose `metadata.title` matches:
- Single word (no spaces)
- Common trivial patterns: `test`, `exit`, `quit`, `hello`, `help`
- Prompt is `<user_input>...</user_input>` wrapping only the above
  spawn('osascript', [
    '-e', `tell application "Terminal" to activate`,
    '-e', `tell application "Terminal" to do script "cd ${cwd} && cline --id ${sessionId}" in front window`
  ]);
  res.writeHead(200);
  res.end('{}');
});
```

**Important:** The `cline --id` flag was confirmed via CLI docs (`--id <session-id> Resume an existing session by ID`). The full command is:
```bash
cline --id <sessionId> -c <cwd>
```

---

## 5. Session List Logic

### 5.1 Data Shape in Server

In-memory session cache maintained by the dashboard process:

```javascript
let sessions = [];   // populated on connect via listSessions(200)
```

### 5.2 Subagent Filtering

The `SessionRecord` from the hub does **not** include an `is_subagent` boolean. Instead, subagent relationship is determined by:
- The `participants[].role` field (creator vs spawned agent)
- The `metadata.parentSessionId` field (present on subagent sessions)

```javascript
function isRootSession(session) {
  return !session.metadata?.parentSessionId && !session.parentSessionId;
}
```

For v1: filter to root sessions only (where `parentSessionId` is absent).

### 5.3 Sorting

Default sort order (descending priority):
1. `running` → `stale` → `idle` → `failed` → `completed`
2. Within same status: `updatedAt` descending (most recent first)

### 5.4 Cost Display

```javascript
function formatCost(usd) {
  if (usd == null || usd === 0) return '—';
  return '$' + usd.toFixed(3);
}
```

---

## 6. Stale Session Detection

On backend, when rendering the session list or receiving a `session.updated` event:

```javascript
const pidCache = new Map();  // pid → boolean (alive), TTL 5 seconds

async function isPidAlive(pid) {
  const cached = pidCache.get(pid);
  if (cached && Date.now() - cached.ts < 5000) return cached.alive;
  let alive = false;
  try {
    process.kill(pid, 0);  // signal 0 = probe only
    alive = true;
  } catch (e) {
    alive = false;  // ESRCH = no such process, EPERM = alive but no perms
    if (e.code === 'EPERM') alive = true;
  }
  pidCache.set(pid, { alive, ts: Date.now() });
  return alive;
}
```

Note: `kill(0)` returns `true` for processes owned by the current user; `EPERM` means alive but belongs to another user (treat as alive). `ESRCH` or `ENOENT` means dead.

---

## 7. File Structure

```
~/.cline/
  dashboard/
    dashboard.js          ← main server (single file, all JS)
    README.md             ← usage instructions
    plans/
      dashboard-prd.md         ← this PRD
      dashboard-techspec.md    ← this tech spec
    index.html            ← optional external file (or embedded in dashboard.js)
```

### 7.1 Single File Deployment

`dashboard.js` embeds the HTML as a string constant. No `index.html` file is required at runtime. For development, it can optionally read `./index.html` from disk.

---

## 8. Milestones

| # | Milestone | Deliverable | Time |
|---|-----------|-------------|------|
| M1 | **Hub probe** | Script that connects to hub, lists 5 sessions, prints them. Verify `HubSessionClient.readMessages()` works. | 20 min |
| M2 | **HTTP server + sessions** | `dashboard.js` serves JSON at `/api/sessions` with Pico CSS table | 30 min |
| M3 | **Chat read** | `GET /api/messages/:id` reads `.messages.json`, renders in modal | 30 min |
| M4 | **Chat send (verify)** | Test `HubSessionClient.sendRuntimeSession()` — if it works, wire `POST /api/send/:id` | 20 min |
| M5 | **SSE push** | Real-time session + message updates from hub events to browser | 30 min |
| M6 | **File watcher fallback** | `fs.watch()` on `.messages.json` for sessions where hub events miss | 15 min |
| M7 | **Open in Terminal** | `POST /api/open/:id` spawns terminal with `cline --id` | 15 min |
| M8 | **Stale detection** | `kill(0)` PID check, orange badge for dead processes | 15 min |
| M9 | **Polish** | Trivial filter, relative timestamps, Alpine.js reactivity, dark mode | 30 min |

---

## 9. Known Limitations

| Limitation | Impact | Planned Fix |
|------------|--------|-------------|
| `@cline/core` path is hardcoded to asdf install dir | Breaks if Cline is installed elsewhere | Startup probe walks node_modules upward |
| Hub lock file path may change between Cline versions | Connection fails | Probe common locations, log clear error |
| No HTTPS for local server | Fine on localhost; not accessible remotely | Not a concern for v1 |
| `osascript` to open Terminal is macOS only | Linux/Windows would need different launcher | v1 is macOS-only |
| `SessionRecord` lacks `is_subagent` field | Must infer from `parentSessionId` | Works correctly, just less explicit |
| **Chat send may not work via `HubSessionClient`** | Dashboard might be read-only for chat | Fallback to "Open in Terminal" for input; investigate hub capability API for v2 |

---

## 10. Future Enhancements (v2)

- **Bi-directional chat via hub:** Investigate hub capability API for sending messages without terminal fallback
- **Cost tracking:** Aggregate session costs per day/model in a small chart
- **Scheduled agents tab:** Expose `listSchedules()` from `HubSessionClient`
- **Desktop notifications:** Use `client.subscribeUI({ onSessionDetached })` → `Notification API`
- **Cross-platform launcher:** Detect OS and use `xdg-open` / `wt` for non-macOS
