/**
 * sync.test.ts — Tests for sync operations.
 */

jest.mock('../debug');
jest.mock('../plaid');
jest.mock('../sheet-ops');
jest.mock('../sheet-api');
jest.mock('../config');
jest.mock('../dashboard');
jest.mock('../calendar');
jest.mock('../runtime', () => ({ getTimezone: () => 'America/New_York' }));

import * as Debug from '../debug';
import * as PLAID from '../plaid';
import * as SHEET from '../sheet-ops';
import * as sheetApi from '../sheet-api';
import * as config from '../config';
import * as DASHBOARD from '../dashboard';
import * as CALENDAR from '../calendar';
import { syncProductionAccount, syncAllProductionAccounts, resetAndResync } from './index';
import { mockedPlaidTransaction, mockedPlaidBalance, mockedSyncResult } from '../types/mocks';

const mockDebug = jest.mocked(Debug);
const mockPlaid = jest.mocked(PLAID);
const mockSheet = jest.mocked(SHEET);
const mockSheetApi = jest.mocked(sheetApi);
const mockConfig = jest.mocked(config);
const mockDashboard = jest.mocked(DASHBOARD);
const mockCalendar = jest.mocked(CALENDAR);

beforeEach(() => {
  jest.clearAllMocks();
  mockDebug.log.mockResolvedValue(undefined);
  mockDebug.error.mockResolvedValue(undefined);
  mockPlaid.syncTransactions.mockResolvedValue(mockedSyncResult().generate());
  mockPlaid.fetchBalances.mockResolvedValue([]);
  mockSheet.writeTransactions.mockResolvedValue(undefined);
  mockSheet.writeBalances.mockResolvedValue(undefined);
  mockSheet.ensureTab.mockResolvedValue('transactions');
  mockSheetApi.deleteSheet.mockResolvedValue(undefined);
  mockConfig.getKeys.mockReturnValue([]);
  mockDashboard.refresh.mockResolvedValue(undefined);
  mockCalendar.parseCalendarEvents.mockResolvedValue(undefined);
});

describe('sync', () => {
  describe('syncProductionAccount', () => {
    it('syncs transactions and balances for one account', async () => {
      mockPlaid.syncTransactions.mockResolvedValue(
        mockedSyncResult({
          added: [mockedPlaidTransaction({ transaction_id: 't1', account_id: 'a1', amount: 10 }).generate()],
        }).generate()
      );
      mockPlaid.fetchBalances.mockResolvedValue([
        mockedPlaidBalance({ name: 'Chase' }).generate(),
      ]);

      await syncProductionAccount('Chase');

      expect(mockPlaid.syncTransactions).toHaveBeenCalledWith('Chase');
      expect(mockSheet.writeTransactions).toHaveBeenCalled();
      expect(mockPlaid.fetchBalances).toHaveBeenCalledWith('Chase');
      expect(mockSheet.writeBalances).toHaveBeenCalled();
    });

    it('propagates errors from plaid sync', async () => {
      mockPlaid.syncTransactions.mockRejectedValue(new Error('Plaid down'));
      await expect(syncProductionAccount('Chase')).rejects.toThrow('Plaid down');
    });
  });

  describe('syncAllProductionAccounts', () => {
    it('syncs all accounts with ACCESS_TOKEN_ prefix', async () => {
      mockConfig.getKeys.mockReturnValue(['ACCESS_TOKEN_Chase', 'ACCESS_TOKEN_Citi']);
      mockPlaid.syncTransactions.mockResolvedValue(mockedSyncResult().generate());

      await syncAllProductionAccounts();

      expect(mockPlaid.syncTransactions).toHaveBeenCalledTimes(2);
      expect(mockPlaid.syncTransactions).toHaveBeenCalledWith('Chase');
      expect(mockPlaid.syncTransactions).toHaveBeenCalledWith('Citi');
      expect(mockConfig.setProperty).toHaveBeenCalledWith('LAST_SYNC_Chase', expect.any(String));
      expect(mockConfig.setProperty).toHaveBeenCalledWith('LAST_SYNC_Citi', expect.any(String));
      expect(mockCalendar.parseCalendarEvents).toHaveBeenCalled();
      expect(mockDashboard.refresh).toHaveBeenCalled();
    });

    it('continues if one account fails', async () => {
      mockConfig.getKeys.mockReturnValue(['ACCESS_TOKEN_Good', 'ACCESS_TOKEN_Bad']);
      mockPlaid.syncTransactions
        .mockResolvedValueOnce(mockedSyncResult().generate())
        .mockRejectedValueOnce(new Error('Bad account failed'));

      await syncAllProductionAccounts();

      // Good account should still sync
      expect(mockSheet.writeTransactions).toHaveBeenCalled();
      expect(mockCalendar.parseCalendarEvents).toHaveBeenCalled();
      expect(mockDashboard.refresh).toHaveBeenCalled();
    });

    it('does nothing when no linked accounts', async () => {
      mockConfig.getKeys.mockReturnValue(['OTHER_KEY', 'ANOTHER_KEY']);
      await syncAllProductionAccounts();
      expect(mockPlaid.syncTransactions).not.toHaveBeenCalled();
    });

    it('combines balances from all accounts', async () => {
      mockConfig.getKeys.mockReturnValue(['ACCESS_TOKEN_A', 'ACCESS_TOKEN_B']);
      mockPlaid.fetchBalances
        .mockResolvedValueOnce([mockedPlaidBalance({ name: 'A' }).generate()])
        .mockResolvedValueOnce([mockedPlaidBalance({ name: 'B', subtype: 'savings' }).generate()]);

      await syncAllProductionAccounts();

      expect(mockSheet.writeBalances).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'A' }),
          expect.objectContaining({ name: 'B' }),
        ])
      );
    });
  });

  describe('resetAndResync', () => {
    it('clears cursors and re-syncs', async () => {
      mockConfig.getKeys.mockReturnValue(['CURSOR_Chase', 'ACCESS_TOKEN_Chase', 'OTHER_KEY']);
      mockConfig.getProperty.mockReturnValue(null);

      await resetAndResync();

      expect(mockConfig.deleteProperty).toHaveBeenCalledWith('CURSOR_Chase');
      expect(mockSheetApi.deleteSheet).toHaveBeenCalledWith('transactions');
    });

    it('removes sandbox tokens (platypus*)', async () => {
      mockConfig.getKeys.mockReturnValue(['ACCESS_TOKEN_platypus_sandbox']);
      mockConfig.getProperty.mockReturnValue(null);

      await resetAndResync();

      expect(mockConfig.deleteProperty).toHaveBeenCalledWith('ACCESS_TOKEN_platypus_sandbox');
    });
  });
});
