/**
 * snapshot.test.ts — Tests for snapshot module.
 */

jest.mock('../debug');
jest.mock('../sheet-api');

import * as Debug from '../debug';
import * as sheetApi from '../sheet-api';
import { snapshotMonth, snapshotCurrentMonth, autoSnapshotOnRollover } from './index';

const mockDebug = jest.mocked(Debug);
const mockSheetApi = jest.mocked(sheetApi);

beforeEach(() => {
  jest.clearAllMocks();
  mockDebug.log.mockResolvedValue(undefined);
  mockDebug.error.mockResolvedValue(undefined);
  mockSheetApi.copySheet.mockResolvedValue(123);
});

describe('snapshot', () => {
  describe('snapshotMonth', () => {
    it('copies all 4 tabs with month suffix', async () => {
      const result = await snapshotMonth('2026-07');

      expect(mockSheetApi.copySheet).toHaveBeenCalledTimes(4);
      expect(mockSheetApi.copySheet).toHaveBeenCalledWith('transactions', 'transactions_2026-07');
      expect(mockSheetApi.copySheet).toHaveBeenCalledWith('interview_income', 'interview_income_2026-07');
      expect(mockSheetApi.copySheet).toHaveBeenCalledWith('adjustments', 'adjustments_2026-07');
      expect(mockSheetApi.copySheet).toHaveBeenCalledWith('dashboard', 'dashboard_2026-07');
      expect(result.created).toEqual([
        'transactions_2026-07',
        'interview_income_2026-07',
        'adjustments_2026-07',
        'dashboard_2026-07',
      ]);
      expect(result.skipped).toEqual([]);
    });

    it('skips missing tabs', async () => {
      mockSheetApi.copySheet.mockResolvedValue(null);

      const result = await snapshotMonth('2026-07');

      expect(result.created).toEqual([]);
      expect(result.skipped.length).toBe(4);
    });

    it('handles errors gracefully', async () => {
      mockSheetApi.copySheet.mockRejectedValueOnce(new Error('API error'));
      mockSheetApi.copySheet.mockResolvedValue(123);

      const result = await snapshotMonth('2026-07');

      expect(result.created.length).toBe(3);
      expect(result.skipped.length).toBe(1);
    });
  });

  describe('snapshotCurrentMonth', () => {
    it('reads month from dashboard B4 and snapshots', async () => {
      mockSheetApi.getCell.mockResolvedValue('2026-07');

      const result = await snapshotCurrentMonth();

      expect(mockSheetApi.getCell).toHaveBeenCalledWith('dashboard', 'B4');
      expect(result).toBeDefined();
    });

    it('returns void if dashboard not found', async () => {
      mockSheetApi.getCell.mockRejectedValue(new Error('not found'));

      const result = await snapshotCurrentMonth();

      expect(result).toBeUndefined();
      expect(mockDebug.error).toHaveBeenCalled();
    });

    it('returns void if month is invalid', async () => {
      mockSheetApi.getCell.mockResolvedValue('invalid');

      const result = await snapshotCurrentMonth();

      expect(result).toBeUndefined();
      expect(mockDebug.error).toHaveBeenCalled();
    });
  });

  describe('autoSnapshotOnRollover', () => {
    it('snapshots previous month', async () => {
      const result = await autoSnapshotOnRollover('2026-06');

      expect(mockSheetApi.copySheet).toHaveBeenCalledTimes(4);
      expect(mockSheetApi.copySheet).toHaveBeenCalledWith('transactions', 'transactions_2026-06');
    });

    it('does nothing when no previous month', async () => {
      const result = await autoSnapshotOnRollover();

      expect(result).toBeUndefined();
      expect(mockSheetApi.copySheet).not.toHaveBeenCalled();
    });
  });
});
