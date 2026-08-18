/**
 * sheet-ops.test.ts — Tests for sheet operations (writeTransactions, writeBalances).
 */

jest.mock('../sheet-api');
jest.mock('../debug');
jest.mock('../plaid');

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import * as PLAID from '../plaid';
import { writeTransactions, writeBalances, pruneOldData } from './index';
import { mockedPlaidTransaction, mockedPlaidBalance, mockedSyncResult } from '../types/mocks';

const mockSheetApi = jest.mocked(sheetApi);
const mockPlaid = jest.mocked(PLAID);

beforeEach(() => {
  jest.clearAllMocks();
  mockSheetApi.ensureTab.mockResolvedValue('transactions');
  mockSheetApi.getValues.mockResolvedValue([[
    'account_name', 'date', 'merchant_name', 'amount',
    'transaction_id', 'account_id', 'name', 'category',
    'payment_channel', 'pending', 'currency', 'synced_at',
  ]]);
  mockSheetApi.clearTab.mockResolvedValue(undefined);
  mockSheetApi.setValues.mockResolvedValue(undefined);
  mockSheetApi.setCell.mockResolvedValue(undefined);
  mockSheetApi.appendRow.mockResolvedValue(undefined);
  mockPlaid.getAccountNames.mockResolvedValue({});
  Debug.log.mockResolvedValue(undefined);
  Debug.error.mockResolvedValue(undefined);
});

describe('sheet-ops', () => {
  describe('writeTransactions', () => {
    it('writes added transactions to sheet', async () => {
      const syncResult = mockedSyncResult({
        added: [mockedPlaidTransaction({
          transaction_id: 'tx1', account_id: 'a1', amount: 25.50,
          date: '2026-07-15', name: 'Coffee', merchant_name: 'Starbucks',
          account_name: 'Chase', payment_channel: 'in store', currency: 'USD', category: 'Food',
        }).generate()],
      }).generate();

      await writeTransactions(syncResult);

      expect(mockSheetApi.ensureTab).toHaveBeenCalled();
      expect(mockSheetApi.clearTab).toHaveBeenCalledWith('transactions', true);
      expect(mockSheetApi.setValues).toHaveBeenCalledWith(
        'transactions!A2',
        expect.arrayContaining([
          expect.arrayContaining(['Chase', '2026-07-15', 'Starbucks', 25.50, 'tx1']),
        ])
      );
    });

    it('removes transactions and writes remaining ones', async () => {
      mockSheetApi.getValues.mockResolvedValueOnce([
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ['Chase', '2026-07-10', 'Old Shop', 10, 'old1', 'a1', 'Old', 'Shopping', 'online', 'FALSE', 'USD', '2026-07-10'],
        ['Chase', '2026-07-12', 'Keep Shop', 20, 'keep1', 'a1', 'Keep', 'Shopping', 'online', 'FALSE', 'USD', '2026-07-12'],
      ]);

      const syncResult = mockedSyncResult({
        removed: [mockedPlaidTransaction({ transaction_id: 'old1', account_id: 'a1', amount: 10 }).generate()],
      }).generate();

      await writeTransactions(syncResult);

      const dataCall = mockSheetApi.setValues.mock.calls.find(c => c[0] === 'transactions!A2');
      expect(dataCall).toBeDefined();
      expect(dataCall![1]).toHaveLength(1);
      expect(dataCall![1][0]).toContain('keep1');
    });

    it('skips data write when all transactions removed', async () => {
      mockSheetApi.getValues.mockResolvedValueOnce([
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ['Chase', '2026-07-10', 'Only', 10, 'only1', 'a1', 'Only', 'Shopping', 'online', 'FALSE', 'USD', '2026-07-10'],
      ]);

      const syncResult = mockedSyncResult({
        removed: [mockedPlaidTransaction({ transaction_id: 'only1', account_id: 'a1', amount: 10 }).generate()],
      }).generate();

      await writeTransactions(syncResult);

      expect(mockSheetApi.setValues).toHaveBeenCalledTimes(1);
    });

    it('updates modified transactions with new amounts', async () => {
      mockSheetApi.getValues.mockResolvedValueOnce([
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ['Chase', '2026-07-10', 'Shop', 10, 'upd1', 'a1', 'Shop', 'Shopping', 'online', 'FALSE', 'USD', '2026-07-10'],
      ]);

      const syncResult = mockedSyncResult({
        modified: [mockedPlaidTransaction({ transaction_id: 'upd1', account_id: 'a1', amount: 20, date: '2026-07-20', name: 'Updated Shop' }).generate()],
      }).generate();

      await writeTransactions(syncResult);

      const dataCall = mockSheetApi.setValues.mock.calls.find(c => c[0] === 'transactions!A2');
      expect(dataCall).toBeDefined();
      expect(dataCall![1][0]).toContain(20);
    });

    it('skips duplicate transactions', async () => {
      mockSheetApi.getValues.mockResolvedValueOnce([
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ['Chase', '2026-07-10', 'Shop', 10, 'dup1', 'a1', 'Shop', 'Shopping', 'online', 'FALSE', 'USD', '2026-07-10'],
      ]);

      const syncResult = mockedSyncResult({
        added: [mockedPlaidTransaction({ transaction_id: 'dup1', account_id: 'a1', amount: 10, date: '2026-07-10', name: 'Shop' }).generate()],
      }).generate();

      await writeTransactions(syncResult);

      const dataCall = mockSheetApi.setValues.mock.calls.find(c => c[0] === 'transactions!A2');
      expect(dataCall).toBeDefined();
      expect(dataCall![1]).toHaveLength(1);
    });

    it('skips duplicate transactions with case-insensitive transaction_id', async () => {
      mockSheetApi.getValues.mockResolvedValueOnce([
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ['Chase', '2026-07-10', 'Shop', 10, 'ABC123XYZ', 'a1', 'Shop', 'Shopping', 'online', 'FALSE', 'USD', '2026-07-10'],
      ]);

      const syncResult = mockedSyncResult({
        added: [mockedPlaidTransaction({ transaction_id: 'abc123xyz', account_id: 'a1', amount: 10, date: '2026-07-10', name: 'Shop' }).generate()],
      }).generate();

      await writeTransactions(syncResult);

      const dataCall = mockSheetApi.setValues.mock.calls.find(c => c[0] === 'transactions!A2');
      expect(dataCall).toBeDefined();
      expect(dataCall![1]).toHaveLength(1);
    });

    it('accepts a plain array of transactions', async () => {
      mockSheetApi.getValues.mockResolvedValueOnce([['header']]);
      const txns = [mockedPlaidTransaction({ transaction_id: 't1', account_id: 'a1', amount: 5, date: '2026-07-01' }).generate()];
      await writeTransactions(txns);
      expect(mockSheetApi.ensureTab).toHaveBeenCalled();
    });
  });

  describe('writeBalances', () => {
    it('calculates total balance correctly for debit accounts', async () => {
      const balances = [
        mockedPlaidBalance({ name: 'Checking', available: 5000, current: 5000 }).generate(),
        mockedPlaidBalance({ name: 'Savings', subtype: 'savings', available: 10000, current: 10000 }).generate(),
      ];

      await writeBalances(balances);
      expect(mockSheetApi.setCell).toHaveBeenCalledWith('dashboard', 'B1', 15000);
    });

    it('subtracts credit card balance (negative available)', async () => {
      const balances = [
        mockedPlaidBalance({ name: 'Checking', available: 5000, current: 5000 }).generate(),
        mockedPlaidBalance({ name: 'Credit Card', type: 'credit', subtype: 'credit card', available: -500, current: -500 }).generate(),
      ];
      await writeBalances(balances);
      expect(mockSheetApi.setCell).toHaveBeenCalledWith('dashboard', 'B1', 5500);
    });

    it('handles available null, falls back to current', async () => {
      const balances = [
        mockedPlaidBalance({ name: 'Acct', available: null, current: 3000 }).generate(),
      ];
      await writeBalances(balances);
      expect(mockSheetApi.setCell).toHaveBeenCalledWith('dashboard', 'B1', 3000);
    });

    it('handles empty balances array', async () => {
      await writeBalances([]);
      expect(mockSheetApi.setCell).toHaveBeenCalledWith('dashboard', 'B1', 0);
    });

    it('does not throw when dashboard tab missing', async () => {
      mockSheetApi.setCell.mockRejectedValue(new Error('Tab not found'));
      await expect(writeBalances([mockedPlaidBalance({ available: 100, current: 100 }).generate()])).resolves.toBeUndefined();
    });
  });

  describe('pruneOldData', () => {
    it('prunes rows prior to current month from transactions, interview_income, and adjustments', async () => {
      mockSheetApi.getValues.mockImplementation(async (tabName) => {
        if (tabName === 'transactions') {
          return [
            ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id'],
            ['Chase', '2026-07-28', 'Old Tx', 50, 'tx_old'],
            ['Chase', '2026-08-05', 'New Tx', 20, 'tx_new'],
          ];
        }
        if (tabName === 'interview_income') {
          return [
            ['date', 'title', 'status'],
            ['2026-07-15', 'Old Interview', 'Past'],
            ['2026-08-10', 'New Interview', 'Upcoming'],
          ];
        }
        if (tabName === 'adjustments') {
          return [
            ['date', 'amount', 'notes'],
            ['2026-07-20', -10, 'July adjustment'],
            ['2026-08-01', 15, 'August adjustment'],
          ];
        }
        return [];
      });

      const pruned = await pruneOldData('2026-08');

      expect(pruned).toEqual({
        transactions: 1,
        interview_income: 1,
        adjustments: 1,
      });

      expect(mockSheetApi.clearTab).toHaveBeenCalledWith('transactions', true);
      expect(mockSheetApi.setValues).toHaveBeenCalledWith('transactions!A2', [
        ['Chase', '2026-08-05', 'New Tx', 20, 'tx_new'],
      ]);

      expect(mockSheetApi.clearTab).toHaveBeenCalledWith('interview_income', true);
      expect(mockSheetApi.setValues).toHaveBeenCalledWith('interview_income!A2', [
        ['2026-08-10', 'New Interview', 'Upcoming'],
      ]);

      expect(mockSheetApi.clearTab).toHaveBeenCalledWith('adjustments', true);
      expect(mockSheetApi.setValues).toHaveBeenCalledWith('adjustments!A2', [
        ['2026-08-01', 15, 'August adjustment'],
      ]);
    });
  });
});
