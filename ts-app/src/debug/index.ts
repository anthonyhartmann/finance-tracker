/**
 * debug.ts — Replaces Debug.gs. Logs to console AND to a "debug" tab in the sheet.
 */

import * as sheetApi from '../sheet-api';
import { getTimezone } from '../runtime';

const SHEET_NAME = 'debug';
const MAX_DEBUG_ROWS = 1000;

function getTimestamp(): string {
  const now = new Date();
  const tz = getTimezone();
  return now
    .toLocaleString('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/\//g, '-');
}

export async function ensureTab(): Promise<void> {
  try {
    await sheetApi.ensureTab(SHEET_NAME, ['timestamp', 'function', 'message']);
  } catch {
    // ignore if sheet API not ready
  }
}

export async function rotateLog(): Promise<void> {
  try {
    const data = await sheetApi.getValues(SHEET_NAME);
    if (!data || data.length <= MAX_DEBUG_ROWS) return;

    // keep headers (row 0) and the most recent (MAX_DEBUG_ROWS - 1) data rows
    const headers = data[0];
    const tail = data.slice(data.length - (MAX_DEBUG_ROWS - 1));
    const trimmed = [headers, ...tail];

    await sheetApi.clearTab(SHEET_NAME, false);
    await sheetApi.setValues(`${SHEET_NAME}!A1`, trimmed);
  } catch {
    // ignore rotation errors so logging never blocks
  }
}

export async function log(fn: string, message: string): Promise<void> {
  const timestamp = getTimestamp();
  let safeMessage = String(message);
  while (safeMessage.startsWith('=')) {
    safeMessage = safeMessage.substring(1);
  }
  console.log(`[${fn}] ${message}`);
  try {
    await sheetApi.appendRow(SHEET_NAME, [timestamp, fn, safeMessage]);
    await rotateLog();
  } catch {
    // If sheet fails, at least we have console
  }
}

export async function logRaw(fn: string, data: unknown): Promise<void> {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  await log(fn, json);
}

export async function error(fn: string, err: unknown): Promise<void> {
  const msg = err && (err as Error).message ? (err as Error).message : String(err);
  await log(fn, `ERROR: ${msg}`);
  if (err && (err as Error).stack) {
    await log(fn, `STACK: ${(err as Error).stack}`);
  }
  console.error(`[${fn}] ${msg}`);
}
