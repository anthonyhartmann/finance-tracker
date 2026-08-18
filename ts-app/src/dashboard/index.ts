/**
 * dashboard.ts — The 3 numbers: Actual Spend, Net Income, Daily Budget.
 * Replaces Dashboard.gs.
 */

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import * as RECURRING from '../recurring';
import * as config from '../config';
import { getTimezone } from '../runtime';
import type { CellValue } from '../types';
import { normalizeMonth } from '../savings';

const TAB = 'dashboard';

export async function init(): Promise<void> {
  const data = await sheetApi.getValues(TAB);
  let existingTarget: number | null = null;
  if (data && data.length > 4) {
    const b5 = data[4][1];
    if (b5 !== '' && b5 !== null && !isNaN(Number(b5))) {
      existingTarget = Number(b5);
    }
  }

  const tz = getTimezone();
  const now = new Date();
  const monthStr = now.toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7);

  const layout: CellValue[][] = [
    ['Finance Tracker Dashboard', '', ''],
    ['Refresh All', '', 'Click checkbox to sync transactions, savings, and calendar'],
    ['Controls', '', ''],
    ['Month (YYYY-MM)', monthStr, ''],
    ['Monthly Target', existingTarget !== null ? existingTarget : 4000, ''],
    ['', '', ''],
    ['The 3 Numbers', '', ''],
    ['Actual Spend', '', 'Money out (excl transfers)'],
    ['Interview Income', '', 'From Calendar parser'],
    ['Manual Adjustments', '', 'Refunds, cash, corrections'],
    ['Net Income', '', '9000 + interviews + manual - spend - recurring'],
    ['', '', ''],
    ['Daily Budget', '', '(Net Income - target) / days remaining'],
    ['Upcoming Bills (unpaid)', '', 'From recurring tab'],
    ['Include Upcoming in Spend', 1, '0 = actual only, 1 = include expected bills'],
    ['', '', ''],
    ['Savings Summary', '', ''],
    ['Total Saved', '=SUM(savings_tracker!B2:B)', 'All months combined'],
    ['Avg Monthly Savings', '=AVERAGE(savings_tracker!B2:B)', 'Average per month'],
    ['Months Saved', '=COUNT(savings_tracker!B2:B)', 'Number of months with data'],
    ['', '', ''],
    ['Interview Settings', '', ''],
    ['Standard Rate ($)', 85, 'Coding / Behavioral / System Design'],
    ['Non-Standard Rate ($)', 115, 'Other interview types'],
    ['Cancellation Rate ($)', 75, 'No-show / late cancellation'],
    ['Tax Scalar', 0.7, 'Applied to gross'],
    ['Count Upcoming Interviews', 1, '0 = past only, 1 = include upcoming'],
    ['', '', ''],
    ['Manual Inputs (resets monthly)', '', ''],
    ['# Non-Standard Interviews', 0, 'Transforms $85 → $115'],
    ['# Late Cancellations', 0, 'Manual entry — event removed from calendar'],
    ['', '', ''],
    ['Account Sync Status', '', 'Last successful Plaid sync per account'],
  ];

  await sheetApi.setValues(`${TAB}!A1:C${layout.length}`, layout);
  await Debug.log('Dashboard.init', 'Dashboard initialized');
}

export async function refresh(): Promise<void> {
  await Debug.log('Dashboard.refresh', 'Refreshing dashboard...');
  await maybeResetManualInputs();
  const ss = await sheetApi.getValues(TAB);
  if (!ss || ss.length === 0) {
    await init();
    return;
  }

  const month = String(ss[3][1] || '').trim();
  if (!month || month.indexOf('-') === -1) {
    await Debug.error('Dashboard.refresh', 'Invalid month in B4: ' + month);
    return;
  }

  const parts = month.split('-');
  const year = Number(parts[0]);
  const monthNum = Number(parts[1]);

  const today = new Date();
  const startOfMonth = year + '-' + padMonth(monthNum) + '-01';
  const endOfMonth = year + '-' + padMonth(monthNum) + '-' + daysInMonth(year, monthNum);

  const actualSpend = await calculateSpend(startOfMonth, endOfMonth);
  const interviewIncome = await calculateInterviewIncome(month);
  const manualAdjustments = await calculateManualAdjustments(startOfMonth, endOfMonth);

  const recurring = await RECURRING.calculateUpcoming(year, monthNum, today);
  const includeUpcoming = Number(ss[14][1] || 0);
  const adjustedSpend = actualSpend + (includeUpcoming ? recurring.upcoming : 0);

  const netIncome = 9000 + interviewIncome + manualAdjustments - adjustedSpend;

  const daysLeft = Math.max(1, daysInMonth(year, monthNum) - today.getDate() + 1);
  const target = Number(ss[4][1] || 0) || 4000;
  const dailyBudget = daysLeft > 0 ? (netIncome - target) / daysLeft : 0;

  await sheetApi.setCell(TAB, 'B8', actualSpend);
  await sheetApi.setCell(TAB, 'B9', interviewIncome);
  await sheetApi.setCell(TAB, 'B10', manualAdjustments);
  await sheetApi.setCell(TAB, 'B11', netIncome);
  await sheetApi.setCell(TAB, 'B13', dailyBudget);
  await sheetApi.setCell(TAB, 'C13', 'Target: ' + target + ', ' + daysLeft + ' days left');
  await sheetApi.setCell(TAB, 'B14', recurring.upcoming);

  await writeSyncStatus();

  await Debug.log('Dashboard.refresh', 'Dashboard refreshed for ' + month);
}

export async function calculateSpend(startDate: string, endDate: string): Promise<number> {
  const tx = await sheetApi.getValues('transactions');
  if (!tx || tx.length < 2) {
    await Debug.log('Dashboard.calculateSpend', 'No transactions found');
    return 0;
  }

  const header = tx[0].map((h) => String(h));
  const dateCol = header.indexOf('date');
  const amountCol = header.indexOf('amount');
  const categoryCol = header.indexOf('category');
  const nameCol = header.indexOf('name');
  const merchantCol = header.indexOf('merchant_name');
  const txIdCol = header.indexOf('transaction_id');

  if (dateCol < 0 || amountCol < 0) {
    await Debug.log('Dashboard.calculateSpend', 'Missing columns: date=' + dateCol + ' amount=' + amountCol);
    return 0;
  }

  await Debug.log('Dashboard.calculateSpend', 'Checking ' + (tx.length - 1) + ' transactions from ' + startDate + ' to ' + endDate + ', dateCol=' + dateCol);
  
  // Debug: show first few raw date values
  const sampleDates = [];
  for (let r = 1; r < Math.min(tx.length, 6); r++) {
    const raw = tx[r][dateCol];
    sampleDates.push('row' + r + '=' + JSON.stringify(raw) + '(type=' + typeof raw + ')');
  }
  await Debug.log('Dashboard.calculateSpend', 'Sample dates: ' + sampleDates.join(', '));

  let total = 0;
  let count = 0;
  let skippedDate = 0;
  let skippedTransfer = 0;
  let skippedAtm = 0;
  let skippedNegative = 0;
  let skippedDupe = 0;

  const seenTxIds = new Set<string>();
  const OWN_ACCOUNT_KEYWORDS = ['brokerage', 'pershing', 'fidelity', '401k', 'ally', 'savings', 'checking'];

  for (let r = 1; r < tx.length; r++) {
    const row = tx[r];

    if (txIdCol >= 0) {
      const rawTxId = String(row[txIdCol] || '').trim();
      if (rawTxId) {
        const lowerTxId = rawTxId.toLowerCase();
        if (seenTxIds.has(lowerTxId)) {
          skippedDupe++;
          continue;
        }
        seenTxIds.add(lowerTxId);
      }
    }

    const rawDate: unknown = row[dateCol];
    // Handle both string dates and Date objects from GAS
    let dateStr: string;
    if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().substring(0, 10);
    } else {
      dateStr = String(rawDate || '');
    }
    if (dateStr < startDate || dateStr > endDate) {
      skippedDate++;
      continue;
    }

    const category = String(row[categoryCol] || '').toUpperCase();
    const name = String(row[nameCol] || '').toLowerCase();
    const merchant = merchantCol >= 0 ? String(row[merchantCol] || '').toLowerCase() : '';
    const combinedText = name + ' ' + merchant;

    const isAtm = combinedText.includes('atm') || combinedText.includes('withdrawal') || combinedText.includes('withdrwl');
    if (isAtm) {
      skippedAtm++;
      continue;
    }

    const isOwnAccountTransfer = OWN_ACCOUNT_KEYWORDS.some((kw) => combinedText.includes(kw));
    if (category === 'TRANSFER' || category === 'LOAN_PAYMENTS' || name.indexOf('transfer') >= 0 || isOwnAccountTransfer) {
      skippedTransfer++;
      continue;
    }

    const amount = Number(row[amountCol]) || 0;
    if (amount > 0) {
      total += amount;
      count++;
    } else {
      skippedNegative++;
    }
  }

  await Debug.log('Dashboard.calculateSpend', 'Counted ' + count + ' transactions, total=$' + total + ' (skipped: ' + skippedDate + ' date, ' + skippedTransfer + ' transfer, ' + skippedAtm + ' ATM, ' + skippedDupe + ' dupe, ' + skippedNegative + ' negative)');
  return Math.round(total * 100) / 100;
}


export async function calculateInterviewIncome(month: string): Promise<number> {
  const sheet = await sheetApi.getValues('interview_income');
  if (!sheet || sheet.length < 2) {
    await Debug.log('Dashboard.calculateInterviewIncome', 'No interview data found');
    return 0;
  }

  const header = sheet[0].map((h) => String(h));
  const dateCol = header.indexOf('date');
  const statusCol = header.indexOf('status');

  const dash = await sheetApi.getValues('dashboard');
  const standardRate = Number(dash[22][1] || 85);
  const nonStandardRate = Number(dash[23][1] || 115);
  const cancellationRate = Number(dash[24][1] || 75);
  const taxScalar = Number(dash[25][1] || 0.7);
  const countUpcoming = Number(dash[26][1] || 1);
  const nonStandardCount = Number(dash[29][1] || 0);
  const lateCancellationCount = Number(dash[30][1] || 0);

  await Debug.log('Dashboard.calculateInterviewIncome', 'Calculating for month=' + month + ' total interviews=' + (sheet.length - 1) + ' rates: std=' + standardRate + ' nonstd=' + nonStandardRate + ' cancel=' + cancellationRate + ' tax=' + taxScalar);

  let count = 0;
  for (let r = 1; r < sheet.length; r++) {
    const row = sheet[r];
    const rawDate: unknown = row[dateCol];
    let dateStr: string;
    if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().substring(0, 10);
    } else {
      dateStr = String(rawDate || '');
    }
    if (!dateStr.startsWith(month)) continue;
    const status = String(row[statusCol] || '');
    if (status === 'Upcoming' && !countUpcoming) continue;
    count++;
  }

  const standardCount = Math.max(0, count - nonStandardCount);
  const gross = standardCount * standardRate + nonStandardCount * nonStandardRate + lateCancellationCount * cancellationRate;
  await Debug.log('Dashboard.calculateInterviewIncome', 'Counted ' + count + ' interviews in ' + month + ' (std=' + standardCount + ' nonstd=' + nonStandardCount + ' cancel=' + lateCancellationCount + ') gross=$' + gross + ' after tax=$' + Math.round(gross * taxScalar * 100) / 100);
  return Math.round(gross * taxScalar * 100) / 100;
}

export async function calculateManualAdjustments(startDate: string, endDate: string): Promise<number> {
  const sheet = await sheetApi.getValues('adjustments');
  if (!sheet || sheet.length < 2) {
    await Debug.log('Dashboard.calculateManualAdjustments', 'No adjustments found');
    return 0;
  }

  const header = sheet[0].map((h) => String(h));
  const dateCol = header.indexOf('date');
  const amountCol = header.indexOf('amount');
  if (dateCol < 0 || amountCol < 0) {
    await Debug.log('Dashboard.calculateManualAdjustments', 'Missing columns: date=' + dateCol + ' amount=' + amountCol);
    return 0;
  }

  await Debug.log('Dashboard.calculateManualAdjustments', 'Checking ' + (sheet.length - 1) + ' adjustments from ' + startDate + ' to ' + endDate);

  let total = 0;
  let count = 0;
  let skipped = 0;
  for (let r = 1; r < sheet.length; r++) {
    const row = sheet[r];
    const rawDate: unknown = row[dateCol];
    let dateStr: string;
    if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().substring(0, 10);
    } else {
      dateStr = String(rawDate || '');
    }
    if (!dateStr || dateStr < startDate || dateStr > endDate) {
      skipped++;
      continue;
    }
    const amount = Number(row[amountCol]) || 0;
    total += amount;
    count++;
  }
  await Debug.log('Dashboard.calculateManualAdjustments', 'Counted ' + count + ' adjustments, total=$' + total + ' (skipped ' + skipped + ' outside date range)');
  return Math.round(total * 100) / 100;
}

export async function maybeResetManualInputs(): Promise<void> {
  const ss = await sheetApi.getValues('dashboard');
  if (!ss || ss.length < 31) return;

  const rawStored = await sheetApi.getCell('dashboard', 'B32');
  const storedMonth = normalizeMonth(rawStored);
  const currentMonth = normalizeMonth(ss[3][1]);

  if (storedMonth && currentMonth && storedMonth !== currentMonth) {
    await Debug.log('Dashboard.maybeResetManualInputs', 'Month rollover detected: ' + storedMonth + ' -> ' + currentMonth);

    // Snapshot before resetting
    try {
      const { autoSnapshotOnRollover } = await import('../snapshot');
      await autoSnapshotOnRollover(storedMonth);
    } catch (e: unknown) {
      await Debug.error('Dashboard.maybeResetManualInputs', 'Snapshot failed: ' + (e instanceof Error ? e.message : String(e)));
    }

    await sheetApi.setCell('dashboard', 'B30', 0);
    await sheetApi.setCell('dashboard', 'B31', 0);
    await Debug.log('Dashboard.maybeResetManualInputs', 'Reset manual inputs for new month: ' + currentMonth);
  }
  if (currentMonth) {
    await sheetApi.setCell('dashboard', 'B32', currentMonth);
  }
}

function padMonth(m: number): string {
  return m < 10 ? '0' + m : String(m);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export async function refreshAll(): Promise<void> {
  const startTime = Date.now();
  await Debug.log('refreshAll', '=== Starting full refresh ===');

  try {
    await Debug.log('refreshAll', 'Step 1/4: Syncing transactions...');
    const { syncAllProductionAccounts } = await import('../sync');
    await syncAllProductionAccounts();
  } catch (e: unknown) {
    await Debug.error('refreshAll', 'Transactions sync failed: ' + (e instanceof Error ? e.message : String(e)));
  }

  try {
    await Debug.log('refreshAll', 'Step 2/4: Parsing calendar events...');
    const { parseCalendarEvents } = await import('../calendar');
    await parseCalendarEvents();
  } catch (e: unknown) {
    await Debug.error('refreshAll', 'Calendar parse failed: ' + (e instanceof Error ? e.message : String(e)));
  }

  try {
    await Debug.log('refreshAll', 'Step 3/4: Backfilling savings...');
    const { backfill } = await import('../savings');
    await backfill('2026-01-01');
  } catch (e: unknown) {
    await Debug.error('refreshAll', 'Savings backfill failed: ' + (e instanceof Error ? e.message : String(e)));
  }

  try {
    await Debug.log('refreshAll', 'Step 4/4: Refreshing dashboard...');
    await refresh();
  } catch (e: unknown) {
    await Debug.error('refreshAll', 'Dashboard refresh failed: ' + (e instanceof Error ? e.message : String(e)));
  }

  const elapsed = (Date.now() - startTime) / 1000;
  await Debug.log('refreshAll', '=== Full refresh complete in ' + elapsed.toFixed(1) + 's ===');
}

/** Write per-account last-sync timestamps to the dashboard (rows 33+). */
async function writeSyncStatus(): Promise<void> {
  const keys = config.getKeys();
  let row = 33;

  await sheetApi.setCell(TAB, 'A' + row, 'Account Sync Status');
  await sheetApi.setCell(TAB, 'C' + row, 'Last successful Plaid sync per account');
  row++;

  for (const k of keys) {
    if (k.startsWith('ACCESS_TOKEN_')) {
      const itemName = k.replace('ACCESS_TOKEN_', '');
      const lastSync = config.getProperty('LAST_SYNC_' + itemName) || 'never';
      await sheetApi.setCell(TAB, 'A' + row, itemName);
      await sheetApi.setCell(TAB, 'B' + row, lastSync);
      row++;
    }
  }

  await Debug.log('Dashboard.writeSyncStatus', 'Wrote sync status for ' + (row - 34) + ' account(s)');
}
