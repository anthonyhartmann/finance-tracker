/**
 * manual.ts — Manual adjustments tab.
 * Replaces Manual.gs.
 */

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import * as DASHBOARD from '../dashboard';
import { getTimezone } from '../runtime';

const TAB = 'adjustments';
const HEADERS = ['date', 'description', 'amount'];

export async function init(): Promise<void> {
  await sheetApi.ensureTab(TAB, HEADERS);
}

export async function addAdjustment(amount: number, description?: string, date?: string): Promise<void> {
  await init();
  const tz = getTimezone();
  const useDate = date || new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const desc = description || '';

  await sheetApi.appendRow(TAB, [useDate, desc, amount]);
  await Debug.log('Manual.addAdjustment', 'Added: ' + desc + ' ($' + amount + ') on ' + useDate);

  try {
    await DASHBOARD.refresh();
  } catch {
    // ignore if dashboard not ready
  }
}
