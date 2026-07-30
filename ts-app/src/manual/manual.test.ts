/**
 * manual.test.ts — Tests for manual adjustments module.
 */

jest.mock('../sheet-api');
jest.mock('../debug');
jest.mock('../dashboard');

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import * as DASHBOARD from '../dashboard';
import { addAdjustment } from './index';

const mockSheetApi = jest.mocked(sheetApi);
const mockDashboard = jest.mocked(DASHBOARD);

beforeEach(() => {
  jest.clearAllMocks();
  mockSheetApi.ensureTab.mockResolvedValue('adjustments');
  mockSheetApi.appendRow.mockResolvedValue(undefined);
  Debug.log.mockResolvedValue(undefined);
  mockDashboard.refresh.mockResolvedValue(undefined);
});

describe('manual', () => {
  describe('addAdjustment', () => {
    it('adds adjustment with date, description, and amount', async () => {
      await addAdjustment(25.50, 'Refund from Amazon', '2026-07-15');

      expect(mockSheetApi.ensureTab).toHaveBeenCalledWith('adjustments', ['date', 'description', 'amount']);
      expect(mockSheetApi.appendRow).toHaveBeenCalledWith(
        'adjustments',
        ['2026-07-15', 'Refund from Amazon', 25.50]
      );
    });

    it('uses today date when not specified', async () => {
      await addAdjustment(10, 'Cash back');

      const call = mockSheetApi.appendRow.mock.calls[0];
      // Date should be today in YYYY-MM-DD format
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      expect(call[1][0]).toBe(today);
      expect(call[1][1]).toBe('Cash back');
      expect(call[1][2]).toBe(10);
    });

    it('uses empty description when not specified', async () => {
      await addAdjustment(5, undefined, '2026-07-20');

      const call = mockSheetApi.appendRow.mock.calls[0];
      expect(call[1][1]).toBe('');
    });

    it('refreshes dashboard after adding', async () => {
      await addAdjustment(100, 'Big refund', '2026-07-10');
      expect(mockDashboard.refresh).toHaveBeenCalled();
    });

    it('does not throw if dashboard refresh fails', async () => {
      mockDashboard.refresh.mockRejectedValue(new Error('Dashboard not ready'));
      await expect(addAdjustment(10, 'test', '2026-07-10')).resolves.toBeUndefined();
    });

    it('handles negative amounts (corrections)', async () => {
      await addAdjustment(-50, 'Overcharge correction', '2026-07-25');
      const call = mockSheetApi.appendRow.mock.calls[0];
      expect(call[1][2]).toBe(-50);
    });
  });
});
