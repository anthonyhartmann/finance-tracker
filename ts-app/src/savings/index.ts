/**
 * savings.ts — Completely isolated savings tracker.
 * Replaces Savings.gs.
 *
 * Tab: savings_tracker
 * Columns: month, net_savings(formula), transfers_auto, retirement_auto,
 *          ally_auto, manual_transfers, manual_retirement, manual_ally_out, details
 */

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import * as PLAID from '../plaid';
import { getTimezone } from '../runtime';
import type {
  PlaidTransaction, PlaidAccount,
  PlaidInvestmentTransaction, SavingsMonthData,
} from '../types';

const TAB = 'savings_tracker';
const HEADERS = [
  'month', 'net_savings', 'transfers_auto', 'retirement_auto',
  'ally_auto', 'manual_transfers', 'manual_retirement', 'manual_ally_out', 'details',
];
const BANK_ITEMS = ['ally', 'bofa', 'fidelity'];
const EXCLUDE_KEYWORDS = ['venmo', 'zelle', 'cash app', 'paypal', 'cashapp', 'atm', 'withdrawal', 'withdrwl'];

interface MonthAccumulator {
  transfers: number;
  retirement: number;
  ally: number;
  manual_transfers: number;
  manual_retirement: number;
  manual_ally: number;
  details: string[];
}

export async function ensureTab(): Promise<void> {
  await sheetApi.ensureTab(TAB, HEADERS);
}

export async function readExisting(): Promise<Record<string, { manual_transfers: number; manual_retirement: number; manual_ally: number }>> {
  const existing: Record<string, { manual_transfers: number; manual_retirement: number; manual_ally: number }> = {};
  try {
    const data = await sheetApi.getValues(TAB);
    for (let i = 1; i < data.length; i++) {
      const month = String(data[i][0] || '').trim();
      if (!month) continue;
      existing[month] = {
        manual_transfers: Number(data[i][5]) || 0,
        manual_retirement: Number(data[i][6]) || 0,
        manual_ally: Number(data[i][7]) || 0,
      };
    }
  } catch {
    // tab might not exist yet
  }
  return existing;
}

/**
 * Normalize a month value to YYYY-MM format.
 * Handles: Date objects (from GAS), "2026-5", "2026-05", "7/1/2026", "Jul 2026".
 */
export function normalizeMonth(value: unknown): string {
  if (!value) return '';
  // Date object from GAS getValues
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    return y + '-' + (m < 10 ? '0' + m : String(m));
  }
  let s = String(value).trim();
  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  // YYYY-M (missing zero pad)
  const m1 = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m1) {
    return m1[1] + '-' + (Number(m1[2]) < 10 ? '0' + m1[2] : m1[2]);
  }
  // M/D/YYYY (GAS date string format)
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    const mo = Number(m2[1]);
    const y = m2[3];
    return y + '-' + (mo < 10 ? '0' + mo : String(mo));
  }
  // YYYY-MM-DD — take first 7 chars
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 7);
  return s;
}

export function buildMonthMap(
  startDate: string,
  endDate: string,
  existing: Record<string, { manual_transfers: number; manual_retirement: number; manual_ally: number }>,
): Record<string, MonthAccumulator> {
  const map: Record<string, MonthAccumulator> = {};
  const startParts = startDate.split('-');
  const endParts = endDate.substring(0, 7).split('-');
  const start = new Date(Number(startParts[0]), Number(startParts[1]) - 1, 1);
  const end = new Date(Number(endParts[0]), Number(endParts[1]) - 1, 1);

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const month = cursor.toISOString().substring(0, 7);
    const prev = existing[month] || {};
    map[month] = {
      transfers: 0, retirement: 0, ally: 0,
      manual_transfers: prev.manual_transfers || 0,
      manual_retirement: prev.manual_retirement || 0,
      manual_ally: prev.manual_ally || 0,
      details: [],
    };
    cursor.setMonth(cursor.getMonth() + 1);
    count++;
  }

  Debug.log('Savings.buildMonthMap', 'Generated ' + count + ' months: ' + Object.keys(map).join(', '));
  return map;
}

export function getCategory(t: PlaidTransaction): string {
  if (typeof t.category === 'string') return t.category.toUpperCase();
  if (t.personal_finance_category && typeof t.personal_finance_category.primary === 'string') {
    return t.personal_finance_category.primary.toUpperCase();
  }
  return '';
}

export function isExcluded(text: string): boolean {
  const lower = text.toLowerCase();
  return EXCLUDE_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function fetchAllTransactions(startDate: string, endDate: string): Promise<PlaidTransaction[]> {
  const all: PlaidTransaction[] = [];

  for (const itemName of BANK_ITEMS) {
    const token = PLAID.getAccessToken(itemName);
    if (!token) continue;

    try {
      const accounts: PlaidAccount[] = await PLAID.getAccounts(itemName);
      const accountMap: Record<string, { name: string; subtype: string }> = {};
      for (const a of accounts) {
        accountMap[a.account_id] = { name: a.name, subtype: a.subtype || '' };
      }

      const txs = await PLAID.transactionsGet(token, startDate, endDate, accountMap);
      all.push(...txs);
      await Debug.log('Savings.fetchAllTransactions', itemName + ': done, total ' + all.length);
    } catch (e: unknown) {
      await Debug.error('Savings.fetchAllTransactions', itemName + ' failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return all;
}

export async function fetchAllInvestmentTransactions(startDate: string, endDate: string): Promise<PlaidInvestmentTransaction[]> {
  const all: PlaidInvestmentTransaction[] = [];

  for (const itemName of BANK_ITEMS) {
    const token = PLAID.getAccessToken(itemName);
    if (!token) continue;

    try {
      const txs = await PLAID.investmentTransactionsGet(token, startDate, endDate);
      all.push(...txs);
      await Debug.log('Savings.fetchAllInvestmentTransactions', itemName + ': done, total ' + all.length);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.indexOf('PRODUCT_NOT_ENABLED') >= 0) {
        await Debug.log('Savings.fetchAllInvestmentTransactions', itemName + ': investments not enabled, skipping');
      } else {
        await Debug.error('Savings.fetchAllInvestmentTransactions', itemName + ' failed: ' + msg);
      }
    }
  }

  return all;
}


export async function writeSheet(byMonth: Record<string, MonthAccumulator>): Promise<void> {
  // Read existing data to preserve months outside the current backfill range.
  // This prevents a narrow backfill (e.g. 2026-01-01) from wiping 2025 data.
  let existingRows: (string | number)[][] = [];
  try {
    const existing = await sheetApi.getValues(TAB);
    if (existing && existing.length > 1) {
      existingRows = existing.slice(1) as (string | number)[][];
    }
  } catch {
    // tab might not exist yet
  }

  // Build a map of all months: existing + new (new overrides existing).
  // Normalize all month keys to YYYY-MM so "2026-5" and "2026-05" merge.
  const allMonths: Record<string, (string | number)[]> = {};
  for (const row of existingRows) {
    const month = normalizeMonth(row[0]);
    if (month && !allMonths[month]) {
      allMonths[month] = row;
      allMonths[month][0] = month; // write back normalized key
    }
  }

  const updatedMonths = Object.keys(byMonth).sort();
  for (const m of updatedMonths) {
    const d = byMonth[m];
    const detailText = d.details.join('\n');
    allMonths[m] = [m, '', d.transfers, d.retirement, d.ally, d.manual_transfers, d.manual_retirement, d.manual_ally, detailText];
  }

  // Sort all months and write with correct row-numbered formulas
  const sortedMonths = Object.keys(allMonths).sort();
  const rows: (string | number)[][] = [];
  for (let i = 0; i < sortedMonths.length; i++) {
    const m = sortedMonths[i];
    const rowNum = i + 2; // row 1 is header, data starts at row 2
    const row = allMonths[m];
    const formula = '=C' + rowNum + '+D' + rowNum + '-E' + rowNum + '+F' + rowNum + '+G' + rowNum + '-H' + rowNum;
    rows.push([row[0], formula, row[2], row[3], row[4], row[5], row[6], row[7], row[8]]);
  }

  await sheetApi.clearTab(TAB, false);
  await sheetApi.setValues(TAB + '!A1', [HEADERS]);
  if (rows.length > 0) {
    await sheetApi.setValues(TAB + '!A2', rows);
  }

  await Debug.log('Savings.writeSheet', 'Wrote ' + rows.length + ' row(s) (' + sortedMonths.length + ' total months, ' + updatedMonths.length + ' updated)');
}

export async function backfill(startDate?: string, endDate?: string): Promise<void> {
  const tz = getTimezone();
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });
  const useStart = startDate || '2026-01-01';
  const useEnd = endDate || todayStr;

  await Debug.log('Savings.backfill', 'startDate=' + useStart + ' endDate=' + useEnd);

  await ensureTab();
  const existing = await readExisting();
  const byMonth = buildMonthMap(useStart, useEnd, existing);

  const allTx = await fetchAllTransactions(useStart, useEnd);
  const allInvTx = await fetchAllInvestmentTransactions(useStart, useEnd);
  await Debug.log('Savings.backfill', 'Fetched ' + allTx.length + ' bank tx, ' + allInvTx.length + ' investment tx');

  for (const t of allTx) {
    const rawDate: unknown = t.date || t.authorized_date || '';
    const dateStr = normalizeMonth(rawDate).substring(0, 7) ? (rawDate instanceof Date ? (rawDate as Date).toISOString().substring(0, 10) : String(rawDate)) : '';
    if (!dateStr || dateStr < useStart || dateStr > useEnd) continue;
    const month = dateStr.substring(0, 7);
    if (!byMonth[month]) continue;

    const accountName = String(t._account_name || '').toLowerCase();
    const accountSubtype = String(t._account_subtype || '').toLowerCase();
    const category = getCategory(t);
    const merchant = String(t.merchant_name || '').toLowerCase();
    const name = String(t.name || '').toLowerCase();
    const amount = Number(t.amount) || 0;

    const isTransfer = category.includes('TRANSFER');
    const isChecking = accountSubtype === 'checking' || accountName.includes('checking');
    const excluded = isExcluded(name + ' ' + merchant);

    if (isTransfer && isChecking && amount > 0 && !excluded) {
      byMonth[month].transfers += amount;
      byMonth[month].details.push(dateStr + ': Transfer to savings $' + amount + ' (' + name + ')');
      continue;
    }

    if (accountName.includes('ally') && amount > 0) {
      byMonth[month].ally += amount;
      byMonth[month].details.push(dateStr + ': Ally outflow $' + amount + ' (' + name + ')');
    }
  }

  for (const inv of allInvTx) {
    const invDateRaw: unknown = inv.date || '';
    const invDate = invDateRaw instanceof Date ? (invDateRaw as Date).toISOString().substring(0, 10) : String(invDateRaw);
    if (!invDate || invDate < useStart || invDate > useEnd) continue;
    const invMonth = invDate.substring(0, 7);
    if (!byMonth[invMonth]) continue;

    const subtype = String(inv.subtype || '').toLowerCase();
    const invAmount = Number(inv.amount) || 0;
    const invName = String(inv.name || '');

    if (subtype === 'contribution' && invAmount < 0) {
      const contrib = Math.abs(invAmount);
      byMonth[invMonth].retirement += contrib;
      byMonth[invMonth].details.push(invDate + ': 401k contrib $' + contrib + ' (' + invName + ')');
    }
  }

  await writeSheet(byMonth);
  await Debug.log('Savings.backfill', 'Wrote ' + Object.keys(byMonth).length + ' month(s)');
  // Populate manual adjustments after writing so hardcoded historical
  // values (transfers/retirement/ally) are set on the fresh sheet.
  await populateManualAdjustments();
}

export async function populateManualAdjustments(): Promise<void> {
  const data = await sheetApi.getValues(TAB);
  if (!data || data.length < 2) {
    await Debug.error('populateManualAdjustments', 'savings_tracker tab not found');
    return;
  }

  // Note: June 2026 auto-detected the $6000 Pershing transfer, so we don't double-count it here.
  const manual: Record<string, { transfers: number; retirement: number; ally: number }> = {
    '2025-08': { transfers: 8000, retirement: 0, ally: 0 },
    '2025-10': { transfers: 6400, retirement: 0, ally: 0 },
    '2025-11': { transfers: 1106.37, retirement: 0, ally: 0 },
    '2026-01': { transfers: 8000, retirement: 0, ally: 0 },
    '2026-02': { transfers: 3000, retirement: 0, ally: 0 },
    '2026-03': { transfers: 3000, retirement: 0, ally: 3533 },
  };

  let updated = 0;
  for (let row = 1; row < data.length; row++) {
    const rawMonth = normalizeMonth(data[row][0]);
    if (manual[rawMonth]) {
      const rowNum = row + 1;
      await sheetApi.setCell(TAB, 'F' + rowNum, manual[rawMonth].transfers);
      await sheetApi.setCell(TAB, 'G' + rowNum, manual[rawMonth].retirement);
      await sheetApi.setCell(TAB, 'H' + rowNum, manual[rawMonth].ally);
      await Debug.log('populateManualAdjustments', 'Set manual values for ' + rawMonth);
      updated++;
    }
  }

  await Debug.log('populateManualAdjustments', 'Updated ' + updated + ' row(s).');
}