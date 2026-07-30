/**
 * sheet-ops.ts — Google Sheet operations: writing data to tabs.
 * Replaces SheetOps.gs.
 */

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import * as PLAID from '../plaid';
import type { SyncResult, PlaidTransaction, PlaidBalance, CellValue } from '../types';

const HEADERS = [
  'account_name', 'date', 'merchant_name', 'amount',
  'transaction_id', 'account_id', 'name', 'category',
  'payment_channel', 'pending', 'currency', 'synced_at',
];

export async function ensureTab(tabName: string, headers: string[]): Promise<string> {
  return sheetApi.ensureTab(tabName, headers);
}

export async function appendRow(tabName: string, row: CellValue[]): Promise<void> {
  await sheetApi.appendRow(tabName, row);
}

export async function writeTransactions(syncResult: SyncResult | PlaidTransaction[]): Promise<void> {
  const tabName = 'transactions';
  await sheetApi.ensureTab(tabName, HEADERS);

  let added: PlaidTransaction[] = [];
  let modified: PlaidTransaction[] = [];
  let removed: PlaidTransaction[] = [];

  if (Array.isArray(syncResult)) {
    added = syncResult;
  } else if (syncResult) {
    added = syncResult.added || [];
    modified = syncResult.modified || [];
    removed = syncResult.removed || [];
  }

  const data = await sheetApi.getValues(tabName);
  const byId: Record<string, PlaidTransaction> = {};
  const order: string[] = [];

  if (data.length > 1) {
    const oldHeader = data[0].map((h) => String(h));
    const idCol = oldHeader.indexOf('transaction_id');
    const effectiveIdCol = idCol < 0 ? 0 : idCol;
    for (let r = 1; r < data.length; r++) {
      const id = String(data[r][effectiveIdCol] || '');
      if (!id) continue;
      const obj: Record<string, CellValue> = {};
      for (let c = 0; c < oldHeader.length; c++) {
        if (oldHeader[c]) obj[oldHeader[c]] = data[r][c];
      }
      byId[id] = obj as unknown as PlaidTransaction;
      order.push(id);
    }
  }

  const needIds: string[] = [];
  function collect(id: string) {
    if (id && !needIds.includes(id)) needIds.push(String(id));
  }
  for (const t of added) collect(t.account_id);
  for (const t of modified) collect(t.account_id);
  for (const oid in byId) {
    if (!byId[oid].account_name) collect(byId[oid].account_id);
  }
  const acctNames = needIds.length > 0 ? await PLAID.getAccountNames(needIds) : {};

  const now = new Date().toISOString();
  function toRow(t: PlaidTransaction): CellValue[] {
    return [
      t.account_name || acctNames[String(t.account_id)] || '',
      t.authorized_date || t.date || '',
      t.merchant_name || '',
      t.amount,
      t.transaction_id,
      t.account_id,
      t.name || '',
      typeof t.category === 'string' ? t.category : (t.personal_finance_category ? t.personal_finance_category.primary : ''),
      t.payment_channel || '',
      t.pending === true || t.pending === 'TRUE' ? 'TRUE' : 'FALSE',
      t.currency || t.iso_currency_code || 'USD',
      t.synced_at || now,
    ];
  }

  let addedCount = 0, updatedCount = 0, removedCount = 0, dupeCount = 0;

  for (const t of removed) {
    const rid = String(t.transaction_id);
    if (byId[rid]) {
      delete byId[rid];
      removedCount++;
    }
  }
  for (const t of modified) {
    const mid = String(t.transaction_id);
    if (byId[mid]) {
      byId[mid] = t;
      updatedCount++;
    } else {
      byId[mid] = t;
      order.push(mid);
      addedCount++;
    }
  }
  for (const t of added) {
    const aid = String(t.transaction_id);
    if (byId[aid]) {
      dupeCount++;
      continue;
    }
    byId[aid] = t;
    order.push(aid);
    addedCount++;
  }

  const out: CellValue[][] = [];
  for (const k of order) {
    if (byId[k]) out.push(toRow(byId[k]));
  }

  await sheetApi.clearTab(tabName, true);
  await sheetApi.setValues(`${tabName}!A1`, [HEADERS]);
  if (out.length > 0) {
    await sheetApi.setValues(`${tabName}!A2`, out);
  }

  await Debug.log('SheetOps.writeTransactions', 'Added: ' + addedCount + ', Updated: ' + updatedCount + ', Removed: ' + removedCount + ', Dupes skipped: ' + dupeCount + ', Total rows: ' + out.length);
}

export async function writeBalances(balances: PlaidBalance[]): Promise<void> {
  const tabName = 'dashboard';
  let total = 0;
  for (const b of balances) {
    const bal = (b.available !== null ? b.available : b.current) ?? 0;
    if (b.type === 'credit') {
      total -= bal;
    } else {
      total += bal;
    }
  }
  try {
    await sheetApi.setCell(tabName, 'B1', total);
    await Debug.log('SheetOps.writeBalances', 'Total available balance: ' + total);
  } catch {
    await Debug.log('SheetOps.writeBalances', 'Dashboard tab not found, skipping balance write');
  }
}
