/**
 * snapshot.ts — Save a full month-end copy of all data tabs.
 * Replaces Snapshot.gs.
 *
 * Creates read-only copies suffixed with the month (e.g. transactions_2026-07).
 */

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';

const TABS = ['transactions', 'interview_income', 'adjustments', 'dashboard'];

export interface SnapshotResult {
  created: string[];
  skipped: string[];
}

/**
 * Snapshot all tabs for a given month.
 */
export async function snapshotMonth(month: string): Promise<SnapshotResult> {
  const suffix = '_' + month;
  const created: string[] = [];
  const skipped: string[] = [];

  for (const srcName of TABS) {
    const dstName = srcName + suffix;

    try {
      const sheetId = await sheetApi.copySheet(srcName, dstName);
      if (sheetId !== null) {
        created.push(dstName);
      } else {
        skipped.push(srcName + ' (missing)');
      }
    } catch {
      skipped.push(srcName + ' (error)');
    }
  }

  await Debug.log(
    'Snapshot.snapshotMonth',
    'Month ' + month + ': created ' + created.length + ' snapshots' +
    (skipped.length ? ', skipped: ' + skipped.join(', ') : ''),
  );

  return { created, skipped };
}

/**
 * Snapshot the month currently shown in the dashboard.
 */
export async function snapshotCurrentMonth(): Promise<SnapshotResult | void> {
  let month: unknown;
  try {
    month = await sheetApi.getCell('dashboard', 'B4');
  } catch {
    await Debug.error('Snapshot.snapshotCurrentMonth', 'dashboard tab not found');
    return;
  }

  if (!month || typeof month !== 'string' || month.indexOf('-') === -1) {
    await Debug.error('Snapshot.snapshotCurrentMonth', 'Invalid month in dashboard B4: ' + month);
    return;
  }

  return snapshotMonth(month);
}

/**
 * Auto-snapshot the PREVIOUS month when the dashboard month rolls over.
 */
export async function autoSnapshotOnRollover(previousMonth?: string): Promise<SnapshotResult | void> {
  if (!previousMonth) return;
  await Debug.log('Snapshot.autoSnapshotOnRollover', 'Auto-snapshotting previous month: ' + previousMonth);
  return snapshotMonth(previousMonth);
}
