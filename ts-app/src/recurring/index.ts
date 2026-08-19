/**
 * recurring.ts — Track expected monthly/weekly bills.
 * Replaces Recurring.gs.
 */

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import { getTimezone, formatDateCell } from '../runtime';
import type { RecurringItem, RecurringResult } from '../types';

/** Matched transaction from the transactions tab. */
interface TransactionMatch {
  merchant_name: string;
  name: string;
}

const TAB = 'recurring';
const HEADERS = ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'];

export async function init(): Promise<void> {
  await sheetApi.ensureTab(TAB, HEADERS);
}

/**
 * Normalize a string for deterministic matching:
 * lowercase, strip non-alphanumeric, trim whitespace.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

export async function calculateUpcoming(year: number, monthNum: number, _today: Date): Promise<RecurringResult> {
  const data = await sheetApi.getValues(TAB);
  if (!data || data.length < 2) return { upcoming: 0, items: [] };

  const header = data[0].map((h) => String(h));
  const merchCol = header.indexOf('merchant_name');
  const amtCol = header.indexOf('amount');
  const freqCol = header.indexOf('frequency');
  const tokenCol = header.indexOf('match_token');
  if (merchCol < 0 || amtCol < 0 || freqCol < 0) {
    await Debug.error('Recurring.calculateUpcoming', 'recurring tab missing required columns');
    return { upcoming: 0, items: [] };
  }

  const tz = getTimezone();
  const monthStart = new Date(year, monthNum - 1, 1).toLocaleDateString('en-CA', { timeZone: tz });
  const monthEnd = new Date(year, monthNum, 0).toLocaleDateString('en-CA', { timeZone: tz });
  const txData = await getTransactionData(monthStart, monthEnd);

  let upcomingTotal = 0;
  const upcomingItems: RecurringItem[] = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const merchant = String(row[merchCol] || '').toLowerCase().trim();
    const amount = Number(row[amtCol]) || 0;
    const frequency = String(row[freqCol] || '').toLowerCase().trim();
    // Use match_token if provided; otherwise normalize merchant_name as fallback
    const rawToken = tokenCol >= 0 ? String(row[tokenCol] || '').trim() : '';
    const matchToken = normalize(rawToken || merchant);

    if (!merchant || amount <= 0) continue;

    const postedCount = countMatches(matchToken, txData);
    const expectedCount = frequency === 'weekly' ? 4 : 1;
    const remainingCount = Math.max(0, expectedCount - postedCount);
    const upcomingAmount = Math.round(remainingCount * amount * 100) / 100;

    if (upcomingAmount > 0) {
      upcomingTotal += upcomingAmount;
      upcomingItems.push({
        merchant,
        amount,
        frequency,
        remaining: remainingCount,
        upcomingAmount,
      });
    }
  }

  await Debug.log('Recurring.calculateUpcoming', 'Upcoming: $' + upcomingTotal + ' from ' + upcomingItems.length + ' bill(s)');
  return { upcoming: upcomingTotal, items: upcomingItems };
}

async function getTransactionData(startDate: string, endDate: string): Promise<TransactionMatch[]> {
  const data = await sheetApi.getValues('transactions');
  if (!data || data.length < 2) return [];

  const header = data[0].map((h) => String(h));
  const dateCol = header.indexOf('date');
  const merchCol = header.indexOf('merchant_name');
  const nameCol = header.indexOf('name');
  if (dateCol < 0) return [];

  const results: TransactionMatch[] = [];
  const tz = getTimezone();
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const rawDate: unknown = row[dateCol];
    const dateStr = formatDateCell(rawDate, tz);
    if (dateStr < startDate || dateStr > endDate) continue;

    results.push({
      merchant_name: String(row[merchCol] || ''),
      name: String(row[nameCol] || ''),
    });
  }
  return results;
}

function countMatches(matchToken: string, txData: TransactionMatch[]): number {
  let count = 0;
  for (const t of txData) {
    const merchants = [normalize(t.merchant_name), normalize(t.name)].filter(Boolean);
    for (const m of merchants) {
      // Match if the normalized transaction string contains the match token
      if (matchToken && m.includes(matchToken)) {
        count++;
        break;
      }
    }
  }
  return count;
}
