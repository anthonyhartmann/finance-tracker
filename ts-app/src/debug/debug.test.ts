/**
 * debug.test.ts — Tests for debug logging module.
 */

jest.mock('../sheet-api');
import * as sheetApi from '../sheet-api';
import * as Debug from './index';

const mockSheetApi = jest.mocked(sheetApi);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('debug', () => {
  describe('ensureTab', () => {
    it('creates debug tab with correct headers', async () => {
      mockSheetApi.ensureTab.mockResolvedValue('debug');
      await Debug.ensureTab();
      expect(mockSheetApi.ensureTab).toHaveBeenCalledWith('debug', ['timestamp', 'function', 'message']);
    });

    it('does not throw if sheet API fails', async () => {
      mockSheetApi.ensureTab.mockRejectedValue(new Error('API down'));
      await expect(Debug.ensureTab()).resolves.toBeUndefined();
    });
  });

  describe('log', () => {
    it('logs to console with function name', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.log('TestFn', 'hello world');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('TestFn'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('hello world'));
    });

    it('appends row to debug sheet', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.log('TestFn', 'test message');
      expect(mockSheetApi.appendRow).toHaveBeenCalledWith(
        'debug',
        expect.arrayContaining(['TestFn', 'test message'])
      );
    });

    it('strips leading = signs from message (prevents formula injection)', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.log('TestFn', '=SUM(A1:A10)');
      const call = mockSheetApi.appendRow.mock.calls[0];
      expect(call[1][2]).toBe('SUM(A1:A10)');
    });

    it('does not throw if sheet API fails', async () => {
      mockSheetApi.appendRow.mockRejectedValue(new Error('API down'));
      await expect(Debug.log('TestFn', 'msg')).resolves.toBeUndefined();
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('logRaw', () => {
    it('logs string data as-is', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.logRaw('TestFn', 'raw string');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('raw string'));
    });

    it('logs object as JSON', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.logRaw('TestFn', { foo: 'bar', num: 42 });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"foo": "bar"'));
    });
  });

  describe('error', () => {
    it('logs error message with ERROR prefix', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.error('TestFn', new Error('something broke'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('ERROR: something broke'));
    });

    it('logs stack trace if available', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.error('TestFn', new Error('fail'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('STACK:'));
    });

    it('logs to console.error', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.error('TestFn', new Error('oops'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('oops'));
    });

    it('handles non-Error objects', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.error('TestFn', 'string error');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('ERROR: string error'));
    });

    it('handles null errors', async () => {
      mockSheetApi.appendRow.mockResolvedValue(undefined);
      await Debug.error('TestFn', null);
      expect(console.log).toHaveBeenCalled();
    });
  });
});
