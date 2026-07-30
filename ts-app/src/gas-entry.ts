// @ts-nocheck
/**
 * gas-entry.ts — GAS entry point.
 * Compiled by esbuild into a single .gs file.
 */

// Import all modules used by GAS handlers
import * as Debug from './debug';
import * as PLAID from './plaid';
import * as SHEET from './sheet-ops';
import * as sync from './sync';
import * as dashboard from './dashboard';
import * as savings from './savings';
import * as calendar from './calendar';
import * as snapshot from './snapshot';
import * as config from './config';

// Expose global functions for GAS
(globalThis as any).doPost = function (e: any) {
  Debug.ensureTab();

  if (!e || !e.postData) {
    Debug.log('doPost', 'No POST data received');
    return ContentService.createTextOutput(JSON.stringify({ error: 'no data' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const rawBody = e.postData.contents;
  Debug.log('doPost', 'POST body: ' + rawBody.substring(0, 500));

  try {
    const parsed = JSON.parse(rawBody);
    if (parsed.public_token) {
      Debug.log('doPost', 'PLAID REDIRECT WITH PUBLIC TOKEN');
      return ContentService.createTextOutput(JSON.stringify({ status: 'token_received' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (_) {}

  try {
    const data = JSON.parse(rawBody);
    Debug.logRaw('doPost', data);

    const webhookType = data.webhook_type;
    const webhookCode = data.webhook_code;
    const itemId = data.item_id;
    Debug.log('doPost', 'Webhook: ' + webhookType + ' / ' + webhookCode + ' for ' + itemId);

    const SYNC_CODES = ['SYNC_UPDATES_AVAILABLE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE'];
    if (webhookType === 'TRANSACTIONS' && SYNC_CODES.indexOf(webhookCode) >= 0) {
      const itemName = _findItemNameByItemId(itemId);
      if (itemName) {
        Debug.log('doPost', 'Syncing: ' + itemName);
        PLAID.syncTransactions(itemName).then(function (result: any) {
          SHEET.writeTransactions(result);
          Debug.log('doPost', 'Sync done: ' + result.added.length + ' new');
          _refreshAllBalances();
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err: any) {
    Debug.error('doPost', err);
    return ContentService.createTextOutput(JSON.stringify({ error: err.message || String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
};

(globalThis as any).doGet = function (e: any) {
  Debug.ensureTab();
  Debug.log('doGet', 'GET received at ' + new Date().toISOString());

  if (e && e.parameter && e.parameter.public_token) {
    Debug.log('doGet', 'PLAID LINK REDIRECT: ' + e.parameter.public_token);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
};

function _findItemNameByItemId(itemId: string): string | null {
  if (!itemId) return null;
  const props = PropertiesService.getScriptProperties();

  const cached = props.getProperty('ITEMID_' + itemId);
  if (cached) return cached;

  const keys = props.getKeys();
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('ACCESS_TOKEN_') === 0) {
      const itemName = keys[i].replace('ACCESS_TOKEN_', '');
      try {
        const token = PLAID.getAccessToken(itemName);
        if (token) {
          PLAID.itemGet(token).then(function (d: any) {
            if (d.item && d.item.item_id) {
              props.setProperty('ITEMID_' + d.item.item_id, itemName);
            }
          });
        }
      } catch (e: any) {
        Debug.log('findItemNameByItemId', 'item/get failed for ' + itemName);
      }
    }
  }
  return cached || null;
}

function _refreshAllBalances(): void {
  const props = PropertiesService.getScriptProperties();
  const keys = props.getKeys();
  const all: any[] = [];
  const promises: Promise<any>[] = [];

  for (let i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('ACCESS_TOKEN_') === 0) {
      const itemName = keys[i].replace('ACCESS_TOKEN_', '');
      promises.push(
        PLAID.fetchBalances(itemName).then(function (b: any) {
          all.push.apply(all, b);
        }).catch(function (e: any) {
          Debug.log('refreshAllBalances', 'Failed for ' + itemName + ': ' + (e.message || e));
        })
      );
    }
  }

  Promise.all(promises).then(function () {
    if (all.length > 0) SHEET.writeBalances(all);
  });
}

// ==================== Scheduled refresh (twice daily) ====================

// LockService guard: prevents parallel runs when multiple time-triggers or
// repeated onEdit B2 clicks fire scheduledRefresh / refreshAll concurrently.
// Returns true if the lock was acquired (caller should proceed), false if
// another run is in progress (caller should bail out).
//
// Stale-lock safety: if a run is cancelled mid-execution (e.g. user clicks
// "Stop" in the GAS editor), the script lock can stay "held" with no live
// process — permanently wedging sync. We stamp LOCK_HELD_AT in
// PropertiesService on acquire; if a new run finds the lock held but the
// timestamp is older than 5 minutes, we force-release and re-acquire.
const STALE_LOCK_MS = 5 * 60 * 1000; // 5 min

function _tryAcquireRefreshLock(): boolean {
  const lock = (LockService as any).getScriptLock();
  const gotIt = lock.tryLock(30000);
  if (gotIt) {
    try { config.setProperty('LOCK_HELD_AT', new Date().toISOString()); } catch {}
    return true;
  }

  // Lock is held — check whether it's stale (a killed run left it stuck).
  let heldAt: string | null = null;
  try { heldAt = config.getProperty('LOCK_HELD_AT'); } catch {}
  if (heldAt) {
    const ageMs = Date.now() - new Date(heldAt).getTime();
    if (ageMs > STALE_LOCK_MS) {
      Debug.log('refreshLock', 'Stale lock detected (' + Math.round(ageMs / 1000) + 's old) — force-releasing.');
      try { lock.releaseLock(); } catch {}
      if (lock.tryLock(1000)) {
        try { config.setProperty('LOCK_HELD_AT', new Date().toISOString()); } catch {}
        return true;
      }
    }
  }

  Debug.log('refreshLock', 'Another refresh is running — skipping this run.');
  return false;
}
function _releaseRefreshLock(): void {
  try { (LockService as any).getScriptLock().releaseLock(); } catch { /* already released */ }
  try { config.deleteProperty('LOCK_HELD_AT'); } catch {}
}

(globalThis as any).scheduledRefresh = function () {
  Debug.ensureTab();
  Debug.log('scheduledRefresh', '=== Starting scheduled refresh ===');

  if (!_tryAcquireRefreshLock()) return Promise.resolve();
  // Note: LockService in GAS holds the lock for the duration of the script
  // execution; we release it explicitly in the final .then/.catch below.

  // syncAllProductionAccounts now parses calendar events before refreshing
  // the dashboard, so interview income is always current.
  return sync.syncAllProductionAccounts()
    .then(function () {
      // Savings backfill is non-critical: if it throws, the dashboard
      // refresh must still run and the sync above still counts as success.
      // (2026-07-26 outage: a backfill ReferenceError failed the whole job.)
      return savings.backfill('2026-01-01').catch(function (e: any) {
        Debug.error('scheduledRefresh(backfill)', e);
      });
    })
    .then(function () { return dashboard.refresh(); })
    .then(function () {
      Debug.log('scheduledRefresh', '=== Scheduled refresh complete ===');
      _releaseRefreshLock();
    })
    .catch(function (e: any) {
      Debug.error('scheduledRefresh', e);
      _releaseRefreshLock();
    });
};

// Expose helpers and main entry points used by top-level GAS declarations
// generated in build-gas.js (onEdit simple trigger + UI-runnable wrappers).
(globalThis as any)._dashboardRefresh = dashboard.refresh;
(globalThis as any)._debugLog = Debug.log;
(globalThis as any)._debugError = Debug.error;
(globalThis as any).syncAllProductionAccounts = sync.syncAllProductionAccounts;
// Wrap refreshAll with the same LockService guard as scheduledRefresh so
// repeated B2 clicks / overlapping time-triggers can't run in parallel.
(globalThis as any).refreshAll = function () {
  if (!_tryAcquireRefreshLock()) return Promise.resolve();
  return dashboard.refreshAll()
    .then(function () { _releaseRefreshLock(); })
    .catch(function (e: any) {
      _releaseRefreshLock();
      throw e;
    });
};
(globalThis as any).resetAndResync = sync.resetAndResync;

// ==================== Trigger setup ====================

(globalThis as any).ensureTriggers = function () {
  const triggers = ScriptApp.getProjectTriggers();
  const ours: any[] = [];
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'scheduledRefresh') ours.push(triggers[i]);
  }
  if (ours.length === 2) {
    console.log('Triggers OK: 2x scheduledRefresh already installed');
    return;
  }
  // GAS doesn't expose a clock trigger's hour, so partial repair is
  // impossible — delete ours and recreate both (idempotent/self-healing).
  for (let i = 0; i < ours.length; i++) {
    ScriptApp.deleteTrigger(ours[i]);
  }
  ScriptApp.newTrigger('scheduledRefresh').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('scheduledRefresh').timeBased().everyDays(1).atHour(20).create();
  console.log('Created twice-daily scheduledRefresh triggers (8:00 + 20:00)');
};

// Diagnostic: list installed project triggers (runnable from editor / clasp run).
(globalThis as any).listTriggers = function () {
  const triggers = ScriptApp.getProjectTriggers();
  const names: string[] = [];
  for (let i = 0; i < triggers.length; i++) {
    names.push(triggers[i].getHandlerFunction() + ' [' + triggers[i].getEventType() + ']');
  }
  console.log(names.length > 0 ? 'Project triggers: ' + names.join(', ') : 'NO TRIGGERS INSTALLED');
  return names;
};

// Nuke ALL scheduledRefresh triggers (use after accidental duplication).
// Run from the GAS editor, then run ensureTriggers to recreate exactly two.
(globalThis as any).cleanupTriggers = function () {
  const triggers = ScriptApp.getProjectTriggers();
  let deleted = 0;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'scheduledRefresh') {
      ScriptApp.deleteTrigger(triggers[i]);
      deleted++;
    }
  }
  console.log('Deleted ' + deleted + ' scheduledRefresh trigger(s).');
  return deleted;
};

// Force-release a stuck LockService script lock (e.g. after cancelling a
// run mid-execution from the GAS editor). Run from the editor, then sync
// will work again.
(globalThis as any).forceReleaseLock = function () {
  try {
    (LockService as any).getScriptLock().releaseLock();
    Debug.log('forceReleaseLock', 'Script lock released.');
  } catch (e: any) {
    Debug.log('forceReleaseLock', 'No lock held or already released: ' + (e instanceof Error ? e.message : String(e)));
  }
  try { config.deleteProperty('LOCK_HELD_AT'); } catch {}
  console.log('Lock force-released. Sync should work now.');
};

// ==================== Deploy helpers ====================

(globalThis as any).configureWebhook = function () {
  const url = ScriptApp.getService().getUrl();
  PropertiesService.getScriptProperties().setProperty('WEBHOOK_URL', url);
  Debug.log('configureWebhook', 'Webhook URL stored: ' + url);

  const props = PropertiesService.getScriptProperties();
  const keys = props.getKeys();
  let updated = 0;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('ACCESS_TOKEN_') === 0) {
      const itemName = keys[i].replace('ACCESS_TOKEN_', '');
      const token = PLAID.getAccessToken(itemName);
      if (token) {
        try {
          PLAID.webhookUpdate(token, url);
          Debug.log('configureWebhook', 'Updated webhook for: ' + itemName);
          updated++;
        } catch (e: any) {
          Debug.error('configureWebhook', 'Failed for ' + itemName + ': ' + (e.message || e));
        }
      }
    }
  }
  Debug.log('configureWebhook', '[OK] Updated ' + updated + ' item(s).');
};
