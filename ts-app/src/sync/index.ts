/**
 * sync.ts — Day-to-day sync operations for linked production accounts.
 * Replaces Sync.gs.
 */

import * as Debug from '../debug';
import * as PLAID from '../plaid';
import * as SHEET from '../sheet-ops';
import * as sheetApi from '../sheet-api';
import * as config from '../config';
import * as DASHBOARD from '../dashboard';
import * as CALENDAR from '../calendar';
import type { PlaidBalance } from '../types';
import { getTimezone } from '../runtime';

/** Stamp LAST_SYNC_<item> in PropertiesService with a human-readable timestamp. */
export function recordSync(itemName: string): string {
  const tz = getTimezone();
  const ts = new Date().toLocaleString('en-CA', { timeZone: tz });
  config.setProperty('LAST_SYNC_' + itemName, ts);
  return ts;
}

export async function syncProductionAccount(itemName: string): Promise<void> {
  await Debug.log('syncProductionAccount', 'Syncing: ' + itemName);

  const result = await PLAID.syncTransactions(itemName);
  await SHEET.writeTransactions(result);

  const balances = await PLAID.fetchBalances(itemName);
  await SHEET.writeBalances(balances);

  const ts = recordSync(itemName);
  await Debug.log('syncProductionAccount', '[OK] ' + itemName + ' synced: ' + result.added.length + ' new, ' + result.modified.length + ' updated, ' + result.removed.length + ' removed. last_sync=' + ts);
}

export async function syncAllProductionAccounts(): Promise<void> {
  await Debug.log('syncAllProductionAccounts', 'Syncing all linked accounts...');

  const keys = config.getKeys();
  let synced = 0;
  let allBalances: PlaidBalance[] = [];

  for (const k of keys) {
    if (k.startsWith('ACCESS_TOKEN_')) {
      const itemName = k.replace('ACCESS_TOKEN_', '');
      await Debug.log('syncAllProductionAccounts', 'Syncing: ' + itemName);

      try {
        const result = await PLAID.syncTransactions(itemName);
        await SHEET.writeTransactions(result);

        const balances = await PLAID.fetchBalances(itemName);
        allBalances = allBalances.concat(balances);

        const ts = recordSync(itemName);
        await Debug.log('syncAllProductionAccounts', itemName + ' done: ' + result.added.length + ' new, ' + result.modified.length + ' updated, ' + result.removed.length + ' removed. last_sync=' + ts);
        synced++;
      } catch (e: unknown) {
        await Debug.error('syncAllProductionAccounts', itemName + ' failed: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
  }

  if (allBalances.length > 0) {
    await SHEET.writeBalances(allBalances);
  }

  // Refresh calendar interview income before recalculating the dashboard.
  // This ensures the Interview Income number is up-to-date during both
  // scheduled and manual syncs.
  try {
    await CALENDAR.parseCalendarEvents();
  } catch (e: unknown) {
    await Debug.error('syncAllProductionAccounts', 'Calendar parse failed: ' + (e instanceof Error ? e.message : String(e)));
  }

  await DASHBOARD.refresh();

  await Debug.log('syncAllProductionAccounts', '[OK] ' + synced + ' accounts synced. Dashboard refreshed.');
}

export async function resetAndResync(): Promise<void> {
  await Debug.log('resetAndResync', '=== Starting reset & resync ===');

  // 1. Delete transactions tab (writeTransactions recreates it with headers)
  try {
    await sheetApi.deleteSheet('transactions');
    await Debug.log('resetAndResync', 'Deleted transactions tab.');
  } catch {
    // tab might not exist
  }

  // 2. Clear ALL cursors + sandbox tokens
  const keys = config.getKeys();
  for (const k of keys) {
    if (k.startsWith('CURSOR_')) {
      config.deleteProperty(k);
      await Debug.log('resetAndResync', 'Cleared cursor: ' + k);
    } else if (k.startsWith('ACCESS_TOKEN_platypus')) {
      config.deleteProperty(k);
      await Debug.log('resetAndResync', 'Removed sandbox token: ' + k);
    }
  }

  // 3. Full re-sync
  await syncAllProductionAccounts();

  await Debug.log('resetAndResync', '=== Reset & resync complete. Future updates arrive via webhook. ===');
}
