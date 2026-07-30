#!/usr/bin/env node
/**
 * Cline Agent Dashboard — single-process local web dashboard.
 * Serves a browser UI (Pico CSS + Alpine.js) backed by the Cline hub daemon.
 *
 * Routes:
 *   GET  /                -> index.html (frontend)
 *   GET  /api/sessions    -> JSON [{session}, ...]   (root sessions, sorted)
 *   GET  /api/events      -> SSE stream (real-time push)
 *   GET  /api/messages/:id-> { messages: [...] }     (conversation history)
 *   POST /api/send/:id    -> send a user message to a running session
 *   POST /api/open/:id    -> open a Terminal running `cline --id <id>`
 *
 * Run:  node ~/.cline/dashboard/dashboard.js   (PORT env, default 25464)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const HOME = os.homedir();
const PORT = parseInt(process.env.PORT || '25464', 10);
const SESSIONS_DIR = path.join(HOME, '.cline/data/sessions');
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');

// ---- Locate @cline/core ----------------------------------------------------
const CLINE_CORE_CANDIDATES = [
  path.join(HOME, '.asdf/installs/nodejs/22.22.1/lib/node_modules/cline/node_modules/@cline/core/dist/index.js'),
];
function findClineCore() {
  for (const c of CLINE_CORE_CANDIDATES) if (fs.existsSync(c)) return c;
  const roots = [path.join(HOME, '.asdf/installs/nodejs'), '/usr/local/lib/node_modules',
    '/opt/homebrew/lib/node_modules', path.join(HOME, '.npm-global/lib/node_modules')];
  for (const root of roots) {
    let dir = root;
    for (let d = 0; d < 6 && fs.existsSync(dir); d++) {
      const c = path.join(dir, 'cline', 'node_modules', '@cline', 'core', 'dist', 'index.js');
      if (fs.existsSync(c)) return c;
      const h = path.join(dir, '@cline', 'core', 'dist', 'index.js');
      if (fs.existsSync(h)) return h;
      dir = path.dirname(dir);
    }
  }
  return null;
}
const HUB_LOCK_PATHS = [
  path.join(HOME, '.cline/data/locks/hub/production.json'),
  path.join(HOME, '.cline/data/locks/hub/staging.json'),
];
function readHubLock() {
  for (const p of HUB_LOCK_PATHS) {
    try { const lock = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (lock && lock.url && lock.authToken) return lock; } catch (_) {}
  }
  return null;
}

// ---- State -----------------------------------------------------------------
const sessionCache = new Map();   // sessionId -> SessionRecord
const sseClients = new Set();      // http.ServerResponse
const pidCache = new Map();        // pid -> {alive, ts}
const lastMsgTs = new Map();       // sessionId -> last seen message ts
let uiClient = null, chatClient = null;
let coreMod = null;

// ---- Stale detection (M8) --------------------------------------------------
function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return true; // unknown -> assume alive
  const cached = pidCache.get(pid);
  if (cached && Date.now() - cached.ts < 5000) return cached.alive;
  let alive = false;
  try { process.kill(pid, 0); alive = true; }
  catch (e) { alive = false; if (e.code === 'EPERM') alive = true; }
  pidCache.set(pid, { alive, ts: Date.now() });
  return alive;
}

// ---- Public session projection --------------------------------------------
function toPublicSession(s) {
  const m = s.metadata || {};
  const pid = m.pid;
  let stale = false;
  if (s.status === 'running' && pid != null) stale = !isPidAlive(pid);
  // strip huge fields; keep everything else
  const meta = { ...m };
  delete meta.systemPrompt;
  return {
    sessionId: s.sessionId, workspaceRoot: s.workspaceRoot, cwd: s.cwd,
    createdAt: s.createdAt, updatedAt: s.updatedAt, status: s.status,
    parentSessionId: s.parentSessionId || (m.parentSessionId || null),
    metadata: meta, _stale: stale,
  };
}
function isRootSession(s) {
  const m = s.metadata || {};
  return !s.parentSessionId && !m.parentSessionId;
}
const STATUS_ORDER = { running: 0, stale: 1, idle: 2, failed: 3, completed: 4 };
function displayStatus(s) {
  if (s.status === 'running' && s._stale) return 'stale';
  return s.status || 'idle';
}
function sortedPublicSessions() {
  const arr = [];
  for (const s of sessionCache.values()) { if (isRootSession(s)) arr.push(toPublicSession(s)); }
  arr.sort((a, b) => {
    const sa = STATUS_ORDER[displayStatus(a)] ?? 9, sb = STATUS_ORDER[displayStatus(b)] ?? 9;
    if (sa !== sb) return sa - sb;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return arr;
}

// ---- Messages from disk ----------------------------------------------------
function messagesFilePath(sessionId) {
  return path.join(SESSIONS_DIR, sessionId, sessionId + '.messages.json');
}
function readMessagesFromDisk(sessionId) {
  const p = messagesFilePath(sessionId);
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
  try {
    const d = JSON.parse(raw);
    return Array.isArray(d) ? d : (d.messages || []);
  } catch (_) { return []; }
}

// ---- SSE broadcast (M5) ----------------------------------------------------
function broadcast(event) {
  const line = 'data: ' + JSON.stringify(event) + '\n\n';
  for (const res of sseClients) { try { res.write(line); } catch (_) {} }
}
function upsertSession(s) {
  if (!s || !s.sessionId) return;
  sessionCache.set(s.sessionId, s);
  broadcast({ type: 'session.updated', session: toPublicSession(s) });
}
function removeSession(id) {
  if (sessionCache.delete(id)) broadcast({ type: 'session.detached', sessionId: id });
}

// ---- File watcher fallback (M6) -------------------------------------------
let watcher = null;
function setupFileWatcher() {
  try {
    watcher = fs.watch(SESSIONS_DIR, { recursive: true }, (evt, filename) => {
      if (!filename || !filename.endsWith('.messages.json')) return;
      const parts = filename.split(path.sep);
      const sessionId = parts[parts.length - 2] || parts[0].replace(/\.messages\.json$/, '');
      onMessagesFileChanged(sessionId);
    });
    watcher.on('error', () => { /* will be retried below */ });
  } catch (_) {}
  // re-arm periodically in case the watcher dies
  setInterval(() => { if (!watcher || watcher.destroyed) setupFileWatcher(); }, 15000).unref();
}
const changeTimers = new Map();
function onMessagesFileChanged(sessionId) {
  // debounce rapid writes
  if (changeTimers.has(sessionId)) clearTimeout(changeTimers.get(sessionId));
  changeTimers.set(sessionId, setTimeout(() => {
    changeTimers.delete(sessionId);
    const msgs = readMessagesFromDisk(sessionId);
    if (!msgs || msgs.length === 0) return;
    const seen = lastMsgTs.get(sessionId) || 0;
    let newest = seen;
    for (const m of msgs) {
      const ts = m.ts || 0;
      if (ts > seen) { newest = Math.max(newest, ts); broadcast({ type: 'message.new', sessionId, message: m }); }
    }
    if (newest > seen) lastMsgTs.set(sessionId, newest);
  }, 250));
}

// ---- Hub connection --------------------------------------------------------
async function setupHub() {
  const corePath = findClineCore();
  if (!corePath) { console.error('[dashboard] FATAL: @cline/core not found'); process.exit(1); }
  const lock = readHubLock();
  if (!lock) { console.error('[dashboard] FATAL: hub lock not found — is the hub daemon running?'); process.exit(1); }
  coreMod = await import(pathToFileURL(corePath).href);
  const { HubUIClient, HubSessionClient } = coreMod;

  uiClient = new HubUIClient({
    address: lock.url, authToken: lock.authToken,
    clientId: 'dashboard-' + Date.now(), clientType: 'dashboard', displayName: 'Agent Dashboard',
  });
  await uiClient.connect();
  console.log('[dashboard] HubUIClient connected to', lock.url);

  const sessions = await uiClient.listSessions(500);
  for (const s of sessions) sessionCache.set(s.sessionId, s);
  console.log('[dashboard] cached', sessions.length, 'sessions');

  uiClient.subscribeUI({
    onSessionCreated: (p) => { const s = p && (p.session || p); if (s && s.sessionId) { sessionCache.set(s.sessionId, s); broadcast({ type: 'session.created', session: toPublicSession(s) }); } },
    onSessionUpdated: (p) => { const s = p && (p.session || p); if (s && s.sessionId) upsertSession(s); },
    onSessionDetached: (p) => { const id = p && (p.sessionId || (p.session && p.session.sessionId)); if (id) removeSession(id); },
  });

  chatClient = new HubSessionClient({
    address: lock.url, authToken: lock.authToken,
    clientId: 'dashboard-chat-' + Date.now(), clientType: 'dashboard', displayName: 'Agent Dashboard (chat)',
  });
  await chatClient.connect();
  console.log('[dashboard] HubSessionClient connected');
}

// ---- HTTP server -----------------------------------------------------------
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (_) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
let indexHtml = '';
function loadIndexHtml() {
  try { indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8'); }
  catch (_) { indexHtml = FALLBACK_HTML; }
  // inject home dir for relative path display
  indexHtml = indexHtml.replace("window.__HOME__ = window.__HOME__ || '';", "window.__HOME__ = " + JSON.stringify(HOME) + ";");
}

function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }
  if (req.method === 'GET' && p === '/api/sessions') {
    return sendJson(res, 200, sortedPublicSessions());
  }
  if (req.method === 'GET' && p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write(': connected\n\n');
    sseClients.add(res);
    const keep = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 30000);
    req.on('close', () => { clearInterval(keep); sseClients.delete(res); });
    return;
  }
  const msgMatch = p.match(/^\/api\/messages\/(.+)$/);
  if (req.method === 'GET' && msgMatch) {
    const id = decodeURIComponent(msgMatch[1]);
    const messages = readMessagesFromDisk(id);
    if (messages === null) { // not on disk -> try hub
      if (chatClient) { chatClient.readMessages(id).then((m) => sendJson(res, 200, { messages: m || [] })).catch(() => sendJson(res, 404, { error: 'session not found' })); }
      else return sendJson(res, 404, { error: 'session not found' });
      return;
    }
    return sendJson(res, 200, { messages });
  }
  const sendMatch = p.match(/^\/api\/send\/(.+)$/);
  if (req.method === 'POST' && sendMatch) {
    const id = decodeURIComponent(sendMatch[1]);
    return handleSend(req, res, id);
  }
  const openMatch = p.match(/^\/api\/open\/(.+)$/);
  if (req.method === 'POST' && openMatch) {
    const id = decodeURIComponent(openMatch[1]);
    return handleOpen(res, id);
  }
  sendJson(res, 404, { error: 'not found' });
}

async function handleSend(req, res, sessionId) {
  const body = await readBody(req);
  const text = (body && (body.text || body.prompt)) || '';
  if (!text.trim()) return sendJson(res, 400, { error: 'empty message' });
  if (!chatClient) return sendJson(res, 503, { error: 'chat client unavailable' });
  const s = sessionCache.get(sessionId);
  if (!s) return sendJson(res, 404, { error: 'session not found' });
  const m = s.metadata || {};
  // ChatRunTurnRequest = { config: ChatStartSessionRequest, prompt, delivery? }
  // Build config from the session's own metadata so it matches the running session.
  const config = {
    workspaceRoot: s.workspaceRoot || s.cwd || HOME,
    cwd: s.cwd || s.workspaceRoot || HOME,
    provider: m.provider || 'cline',
    model: m.model || '',
    source: m.source || 'cli',
    interactive: m.interactive !== false,
    enableTools: m.enableTools !== false,
    enableSpawn: !!m.enableSpawn,
    enableTeams: !!m.enableTeams,
    mode: m.mode || 'act',
  };
  if (m.systemPrompt) config.systemPrompt = m.systemPrompt;
  try {
    await chatClient.sendRuntimeSession(sessionId, { config, prompt: text, delivery: 'queue' });
    // optimistically append the user message via SSE so the panel updates
    broadcast({ type: 'message.new', sessionId, message: { role: 'user', content: [{ type: 'text', text }], ts: Date.now() } });
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    return sendJson(res, 503, { error: e && e.message ? e.message : 'send failed' });
  }
}

function handleOpen(res, sessionId) {
  const s = sessionCache.get(sessionId);
  const cwd = (s && (s.cwd || s.workspaceRoot)) || HOME;
  const cmd = 'cd ' + JSON.stringify(cwd).replace(/^"|"$/g, '') + ' && cline --id ' + sessionId;
  try {
    spawn('osascript', [
      '-e', 'tell application "Terminal" to activate',
      '-e', 'tell application "Terminal" to do script ' + JSON.stringify(cmd) + ' in front window',
    ]);
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    return sendJson(res, 500, { error: e && e.message ? e.message : 'open failed' });
  }
}

// ---- Minimal fallback HTML (only if index.html missing) --------------------
const FALLBACK_HTML = '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem"><h1>Cline Agent Dashboard</h1><p>index.html not found. The API still works:</p><ul><li><a href="/api/sessions">/api/sessions</a></li></ul></body></html>';

// ---- Main ------------------------------------------------------------------
async function main() {
  loadIndexHtml();
  await setupHub();
  setupFileWatcher();
  const server = http.createServer(handleRequest);
  server.on('error', (e) => { console.error('[dashboard] server error:', e); process.exit(1); });
  server.listen(PORT, '127.0.0.1', () => {
    console.log('[dashboard] listening on http://127.0.0.1:' + PORT + '/');
    console.log('[dashboard] open the URL in your browser');
  });
  // graceful shutdown
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log('[dashboard] shutting down…');
      try { if (watcher) watcher.close(); } catch (_) {}
      try { server.close(); } catch (_) {}
      try { chatClient && chatClient.close(); } catch (_) {}
      try { uiClient && uiClient.close(); } catch (_) {}
      process.exit(0);
    });
  }
}
main().catch((e) => { console.error('[dashboard] FATAL:', e); process.exit(1); });
