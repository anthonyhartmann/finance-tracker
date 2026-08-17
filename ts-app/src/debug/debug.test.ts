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

  describe('rotateLog', () => {
    it('trims rows to MAX_DEBUG_ROWS (1000) when row count exceeds 1000', async () => {
      const rows = [['timestamp', 'function', 'message']];
      for (let i = 1; i <= 1050; i++) {
        rows.push([`ts_${i}`, `fn_${i}`, `msg_${i}`]);
      }
      mockSheetApi.getValues.mockResolvedValue(rows);
      mockSheetApi.clearTab.mockResolvedValue(undefined);
      mockSheetApi.setValues.mockResolvedValue(undefined);

      await Debug.rotateLog();

      expect(mockSheetApi.clearTab).toHaveBeenCalledWith('debug', false);
      expect(mockSheetApi.setValues).toHaveBeenCalled();
      const written = mockSheetApi.setValues.mock.calls[0][1] as (string | number)[][];
      expect(written.length).toBe(1000); // 1 header + 999 data rows
      expect(written[0][0]).toBe('timestamp');
      expect(written[1][0]).toBe('ts_52');
    });

    it('does nothing when row count is <= 1000', async () => {
      const rows = [['timestamp', 'function', 'message'], ['ts_1', 'fn_1', 'msg_1']];
      mockSheetApi.getValues.mockResolvedValue(rows);

      await Debug.rotateLog();

      expect(mockSheetApi.clearTab).not.toHaveBeenCalled();
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
