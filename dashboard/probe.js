#!/usr/bin/env node
/**
 * M1 - Hub probe & client verification
 * Connects to the Cline hub daemon via @cline/core, lists sessions, reads
 * message history, and confirms the HubUIClient/HubSessionClient APIs work.
 * Run:  node ~/.cline/dashboard/probe.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const HOME = os.homedir();

const CLINE_CORE_CANDIDATES = [
  path.join(HOME, '.asdf/installs/nodejs/22.22.1/lib/node_modules/cline/node_modules/@cline/core/dist/index.js'),
];
function findClineCore() {
  for (const c of CLINE_CORE_CANDIDATES) if (fs.existsSync(c)) return c;
  const roots = [
    path.join(HOME, '.asdf/installs/nodejs'), '/usr/local/lib/node_modules',
    '/opt/homebrew/lib/node_modules', path.join(HOME, '.npm-global/lib/node_modules'),
  ];
  for (const root of roots) {
    let dir = root;
    for (let depth = 0; depth < 6 && fs.existsSync(dir); depth++) {
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
    try {
      const lock = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (lock && lock.url && lock.authToken) return { ...lock, _path: p };
    } catch (_) {}
  }
  return null;
}

async function main() {
  const corePath = findClineCore();
  if (!corePath) { console.error('[probe] FATAL: could not locate @cline/core'); process.exit(1); }
  console.log('[probe] @cline/core ->', corePath);
  const lock = readHubLock();
  if (!lock) { console.error('[probe] FATAL: no hub lock file found'); process.exit(1); }
  console.log('[probe] hub lock   ->', lock._path);
  console.log('[probe] hub url    ->', lock.url);

  const core = await import(pathToFileURL(corePath).href);
  const { HubUIClient, HubSessionClient } = core;
  if (!HubUIClient || !HubSessionClient) { console.error('[probe] FATAL: clients not exported'); process.exit(1); }

  const ui = new HubUIClient({
    address: lock.url, authToken: lock.authToken,
    clientId: 'dashboard-probe-' + Date.now(), clientType: 'dashboard', displayName: 'Dashboard Probe',
  });
  await ui.connect();
  console.log('[probe] HubUIClient connected, clientId =', ui.getClientId());

  const sessions = await ui.listSessions(200);
  console.log('[probe] listSessions ->', sessions.length, 'sessions');
  const root = sessions.filter((s) => !s.metadata?.parentSessionId && !s.parentSessionId);
  console.log('[probe] root sessions ->', root.length);
  for (const s of root.slice(0, 5)) {
    const m = s.metadata || {};
    console.log('  ---');
    console.log('  sessionId :', s.sessionId);
    console.log('  status    :', s.status);
    console.log('  cwd       :', s.cwd);
    console.log('  title     :', m.title);
    console.log('  model     :', m.model);
    console.log('  cost      :', m.totalCost);
    console.log('  pid       :', m.pid);
    console.log('  mode      :', m.mode);
    console.log('  created   :', new Date(s.createdAt).toISOString());
    console.log('  updated   :', new Date(s.updatedAt).toISOString());
    console.log('  msgsPath  :', m.messagesPath);
  }
  if (root[0]) {
    console.log('\n[probe] === full SessionRecord (first root) ===');
    console.log(JSON.stringify(root[0], null, 2).slice(0, 4000));
  }

  const chat = new HubSessionClient({
    address: lock.url, authToken: lock.authToken,
    clientId: 'dashboard-probe-chat-' + Date.now(), clientType: 'dashboard', displayName: 'Dashboard Probe (chat)',
  });
  await chat.connect();
  console.log('\n[probe] HubSessionClient connected');
  const target = root[0] || sessions[0];
  if (target) {
    try {
      const messages = await chat.readMessages(target.sessionId);
      console.log('[probe] readMessages ->', messages.length, 'messages for', target.sessionId);
      if (messages[0]) { console.log('[probe] === first Message shape ==='); console.log(JSON.stringify(messages[0], null, 2).slice(0, 2500)); }
      if (messages.length > 1 && messages[messages.length - 1]) { console.log('[probe] === last Message shape ==='); console.log(JSON.stringify(messages[messages.length - 1], null, 2).slice(0, 2500)); }
    } catch (e) { console.error('[probe] readMessages FAILED:', e.message); }
  }

  console.log('\n[probe] subscribing to UI events for 3s...');
  let eventCount = 0;
  const unsub = ui.subscribeUI({
    onSessionCreated: (p) => { eventCount++; console.log('[probe] event session.created:', JSON.stringify(p).slice(0, 200)); },
    onSessionUpdated: (p) => { eventCount++; console.log('[probe] event session.updated:', JSON.stringify(p).slice(0, 200)); },
    onSessionDetached: (p) => { eventCount++; console.log('[probe] event session.detached:', JSON.stringify(p).slice(0, 200)); },
    onClientRegistered: () => { eventCount++; console.log('[probe] event client.registered'); },
    onClientDisconnected: () => { eventCount++; console.log('[probe] event client.disconnected'); },
  });
  await new Promise((r) => setTimeout(r, 3000));
  unsub();
  console.log('[probe] received', eventCount, 'UI events in 3s');

  try { chat.close(); } catch (_) {}
  try { ui.close(); } catch (_) {}
  try { await chat.dispose(); } catch (_) {}
  try { await ui.dispose(); } catch (_) {}
  console.log('\n[probe] DONE - all checks passed');
  process.exit(0);
}
main().catch((e) => { console.error('[probe] UNCAUGHT:', e); process.exit(1); });
