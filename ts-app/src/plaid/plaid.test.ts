/**
 * plaid.test.ts — Tests for Plaid API client.
 */

jest.mock('../config');
jest.mock('../debug');
jest.mock('../adapter', () => {
  const mockHttp = { postJson: jest.fn() };
  const mockConfig = { getProperty: jest.fn(), setProperty: jest.fn(), deleteProperty: jest.fn(), getKeys: jest.fn() };
  const mockSheet = {
    ensureTab: jest.fn(),
    getValues: jest.fn(),
    appendRow: jest.fn(),
    setValues: jest.fn(),
    clearTab: jest.fn(),
    getCell: jest.fn(),
    setCell: jest.fn(),
    copySheet: jest.fn(),
    deleteSheet: jest.fn(),
    renameSheet: jest.fn(),
  };
  const mockCalendar = { getCalendarId: jest.fn(), listEvents: jest.fn() };
  return { http: mockHttp, config: mockConfig, sheet: mockSheet, calendar: mockCalendar };
});

import * as config from '../config';
import * as Debug from '../debug';
import { http } from '../adapter';
import { mockedPlaidTransaction } from '../types/mocks';

const mockConfig = jest.mocked(config);
const mockDebug = jest.mocked(Debug);
const mockHttp = jest.mocked(http);

beforeEach(() => {
  jest.clearAllMocks();

  mockConfig.getProperty.mockImplementation((key: string) => {
    const store: Record<string, string> = {
      PLAID_ENVIRONMENT: 'sandbox',
      PLAID_CLIENT_ID: 'test-client-id',
      PLAID_SECRET: 'test-secret',
    };
    return store[key] || null;
  });
  mockConfig.setProperty.mockImplementation(() => {});
  mockConfig.getKeys.mockReturnValue([]);
  mockDebug.log.mockResolvedValue(undefined);
  mockDebug.error.mockResolvedValue(undefined);

  mockHttp.postJson.mockResolvedValue({ status: 200, data: {} });
});

describe('plaid', () => {
  describe('baseUrl', () => {
    it('returns sandbox URL for sandbox environment', async () => {
      const { baseUrl } = await import('./index');
      expect(baseUrl()).toBe('https://sandbox.plaid.com');
    });

    it('returns production URL for production environment', async () => {
      mockConfig.getProperty.mockImplementation((key: string) => {
        if (key === 'PLAID_ENVIRONMENT') return 'production';
        return null;
      });
      const { baseUrl } = await import('./index');
      expect(baseUrl()).toBe('https://production.plaid.com');
    });

    it('defaults to sandbox when no environment set', async () => {
      mockConfig.getProperty.mockReturnValue(null);
      const { baseUrl } = await import('./index');
      expect(baseUrl()).toBe('https://sandbox.plaid.com');
    });
  });

  describe('creds', () => {
    it('returns client_id and secret from config', async () => {
      const { creds } = await import('./index');
      const c = creds();
      expect(c.client_id).toBe('test-client-id');
      expect(c.secret).toBe('test-secret');
    });

    it('returns null for missing credentials', async () => {
      mockConfig.getProperty.mockReturnValue(null);
      const { creds } = await import('./index');
      const c = creds();
      expect(c.client_id).toBeNull();
      expect(c.secret).toBeNull();
    });
  });

  describe('post', () => {
    it('sends POST with credentials in body', async () => {
      mockHttp.postJson.mockResolvedValue({ status: 200, data: { success: true } });
      const { post } = await import('./index');
      const result = await post('/test/endpoint', { foo: 'bar' });

      expect(mockHttp.postJson).toHaveBeenCalledWith(
        'https://sandbox.plaid.com/test/endpoint',
        expect.objectContaining({ client_id: 'test-client-id', secret: 'test-secret', foo: 'bar' })
      );
      expect(result).toEqual({ success: true });
    });

    it('throws on Plaid error response', async () => {
      mockHttp.postJson.mockResolvedValue({
        status: 400,
        data: { error_type: 'INVALID_INPUT', error_message: 'bad' },
      });
      const { post } = await import('./index');
      await expect(post('/test', {})).rejects.toThrow('INVALID_INPUT: bad');
    });

    it('handles network errors', async () => {
      mockHttp.postJson.mockRejectedValue(new Error('network down'));
      const { post } = await import('./index');
      await expect(post('/test', {})).rejects.toThrow('network down');
    });
  });

  describe('getAccessToken / storeAccessToken', () => {
    it('stores access token in config', async () => {
      const { storeAccessToken } = await import('./index');
      storeAccessToken('Chase', 'access-123');
      expect(mockConfig.setProperty).toHaveBeenCalledWith('ACCESS_TOKEN_Chase', 'access-123');
    });

    it('retrieves access token from config', async () => {
      mockConfig.getProperty.mockImplementation((key: string) => {
        if (key === 'ACCESS_TOKEN_Chase') return 'token-abc';
        return null;
      });
      const { getAccessToken } = await import('./index');
      expect(getAccessToken('Chase')).toBe('token-abc');
    });

    it('returns null when token not found', async () => {
      mockConfig.getProperty.mockReturnValue(null);
      const { getAccessToken } = await import('./index');
      expect(getAccessToken('Nonexistent')).toBeNull();
    });
  });

  describe('syncTransactions', () => {
    it('throws when no access token found', async () => {
      mockConfig.getProperty.mockReturnValue(null);
      const { syncTransactions } = await import('./index');
      await expect(syncTransactions('Chase')).rejects.toThrow('No access token found for: Chase');
    });

    it('syncs transactions and stores cursor', async () => {
      mockConfig.getProperty.mockImplementation((key: string) => {
        const store: Record<string, string> = {
          'ACCESS_TOKEN_Chase': 'token-abc',
          PLAID_ENVIRONMENT: 'sandbox', PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', SYNC_START_DATE: '2026-07-01',
        };
        return store[key] || null;
      });
      mockHttp.postJson.mockResolvedValue({
        status: 200,
        data: {
          added: [mockedPlaidTransaction({ transaction_id: 'tx1', account_id: 'acct1', amount: 25.50, date: '2026-07-15', name: 'Coffee' }).generate()],
          modified: [], removed: [], next_cursor: 'cursor-abc', has_more: false,
        },
      });
      const { syncTransactions } = await import('./index');
      const result = await syncTransactions('Chase');
      expect(result.added.length).toBe(1);
      expect(result.added[0].transaction_id).toBe('tx1');
      expect(mockConfig.setProperty).toHaveBeenCalledWith('CURSOR_Chase', 'cursor-abc');
    });

    it('filters transactions before SYNC_START_DATE', async () => {
      mockConfig.getProperty.mockImplementation((key: string) => {
        const store: Record<string, string> = {
          'ACCESS_TOKEN_Chase': 'token-abc',
          PLAID_ENVIRONMENT: 'sandbox', PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', SYNC_START_DATE: '2026-07-01',
        };
        return store[key] || null;
      });
      mockHttp.postJson.mockResolvedValue({
        status: 200,
        data: {
          added: [
            mockedPlaidTransaction({ transaction_id: 'old1', account_id: 'acct1', amount: 10, date: '2026-06-15', name: 'Old' }).generate(),
            mockedPlaidTransaction({ transaction_id: 'new1', account_id: 'acct1', amount: 20, date: '2026-07-15', name: 'New' }).generate(),
          ],
          modified: [], removed: [], next_cursor: 'c1', has_more: false,
        },
      });
      const { syncTransactions } = await import('./index');
      const result = await syncTransactions('Chase');
      expect(result.added.length).toBe(1);
      expect(result.added[0].transaction_id).toBe('new1');
    });

    it('handles removed and modified transactions', async () => {
      mockConfig.getProperty.mockImplementation((key: string) => {
        const store: Record<string, string> = {
          'ACCESS_TOKEN_Chase': 'token-abc',
          PLAID_ENVIRONMENT: 'sandbox', PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', SYNC_START_DATE: '2026-07-01',
        };
        return store[key] || null;
      });
      mockHttp.postJson.mockResolvedValue({
        status: 200,
        data: {
          added: [],
          modified: [mockedPlaidTransaction({ transaction_id: 'mod1', account_id: 'acct1', amount: 99.99, date: '2026-07-20' }).generate()],
          removed: [mockedPlaidTransaction({ transaction_id: 'rem1', account_id: 'acct1', amount: 5 }).generate()],
          next_cursor: 'c2', has_more: false,
        },
      });
      const { syncTransactions } = await import('./index');
      const result = await syncTransactions('Chase');
      expect(result.modified.length).toBe(1);
      expect(result.removed.length).toBe(1);
    });

    it('detects stale cursor and merges missing transactions + resets cursor', async () => {
      mockConfig.getProperty.mockImplementation((key: string) => {
        const store: Record<string, string> = {
          'ACCESS_TOKEN_Chase': 'token-abc',
          'CURSOR_Chase': 'stale-cursor',
          PLAID_ENVIRONMENT: 'sandbox', PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', SYNC_START_DATE: '2026-07-01',
        };
        return store[key] || null;
      });

      // First call: /transactions/sync returns 0 new (cursor is stale —
      // it already advanced past the recent transactions).
      // Second call: /transactions/get (validation window) returns the
      // transactions the cursor missed.
      const recentDate = new Date().toISOString().slice(0, 10);
      const missedTx = mockedPlaidTransaction({
        transaction_id: 'missed1', account_id: 'acct1', amount: 50, date: recentDate, name: 'Missed Coffee',
      }).generate();

      mockHttp.postJson
        .mockResolvedValueOnce({
          status: 200,
          data: { added: [], modified: [], removed: [], next_cursor: 'advanced-past', has_more: false },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { transactions: [missedTx] },
        });

      const { syncTransactions } = await import('./index');
      const result = await syncTransactions('Chase');

      // The missed transaction should be merged into result.added
      expect(result.added.length).toBe(1);
      expect(result.added[0].transaction_id).toBe('missed1');

      // The stale cursor should have been deleted so the next sync rebuilds it
      expect(mockConfig.deleteProperty).toHaveBeenCalledWith('CURSOR_Chase');
    });

    it('does not repair cursor when validation finds no missing transactions', async () => {
      mockConfig.getProperty.mockImplementation((key: string) => {
        const store: Record<string, string> = {
          'ACCESS_TOKEN_Chase': 'token-abc',
          'CURSOR_Chase': 'good-cursor',
          PLAID_ENVIRONMENT: 'sandbox', PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', SYNC_START_DATE: '2026-07-01',
        };
        return store[key] || null;
      });

      const txDate = new Date().toISOString().slice(0, 10);
      const syncedTx = mockedPlaidTransaction({
        transaction_id: 'synced1', account_id: 'acct1', amount: 30, date: txDate, name: 'Synced',
      }).generate();

      // /transactions/sync returns the transaction, /transactions/get returns the same one
      mockHttp.postJson
        .mockResolvedValueOnce({
          status: 200,
          data: { added: [syncedTx], modified: [], removed: [], next_cursor: 'good-cursor-2', has_more: false },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { transactions: [syncedTx] },
        });

      const { syncTransactions } = await import('./index');
      const result = await syncTransactions('Chase');

      // Cursor should be stored (not deleted), no repair
      expect(result.added.length).toBe(1);
      expect(mockConfig.setProperty).toHaveBeenCalledWith('CURSOR_Chase', 'good-cursor-2');
      expect(mockConfig.deleteProperty).not.toHaveBeenCalledWith('CURSOR_Chase');
    });
  });
});
