/**
 * sheet-api.test.ts — Tests for Google Sheets API wrapper.
 * 
 * Note: sheet-api caches _sheets at module level. We create the mock once
 * and reset its implementations in beforeEach to avoid cache issues.
 */

jest.mock('googleapis');
jest.mock('../google-auth');

import { google } from 'googleapis';
import { authorize } from '../google-auth';
import * as sheetApi from './index';

const mockGoogle = jest.mocked(google);
const mockAuthorize = jest.mocked(authorize);

// Create mock sheets once — this object gets cached by _sheets
const mockSheets = {
  spreadsheets: {
    get: jest.fn(),
    batchUpdate: jest.fn(),
    values: {
      get: jest.fn(),
      update: jest.fn(),
      append: jest.fn(),
      clear: jest.fn(),
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();

  // Wire up mock sheets
  (mockGoogle.sheets as any).mockReturnValue(mockSheets);
  mockAuthorize.mockResolvedValue({ auth: {} as any, type: 'oauth' });

  // Default mock implementations
  mockSheets.spreadsheets.get.mockResolvedValue({
    data: {
      sheets: [
        { properties: { title: 'existing', sheetId: 0, gridProperties: { rowCount: 1000 } } },
      ],
    },
  });
  mockSheets.spreadsheets.batchUpdate.mockResolvedValue({});
  mockSheets.spreadsheets.values.get.mockResolvedValue({ data: { values: [['h1', 'h2'], ['a', 'b']] } });
  mockSheets.spreadsheets.values.update.mockResolvedValue({});
  mockSheets.spreadsheets.values.append.mockResolvedValue({});
  mockSheets.spreadsheets.values.clear.mockResolvedValue({});
});

describe('sheet-api', () => {
  describe('ensureTab', () => {
    it('returns tab name when tab already exists', async () => {
      const result = await sheetApi.ensureTab('existing', ['col1']);
      expect(result).toBe('existing');
      expect(mockSheets.spreadsheets.batchUpdate).not.toHaveBeenCalled();
    });

    it('creates new tab when it does not exist', async () => {
      mockSheets.spreadsheets.get
        .mockResolvedValueOnce({ data: { sheets: [] } })
        .mockResolvedValueOnce({
          data: { sheets: [{ properties: { title: 'newTab', sheetId: 42, gridProperties: {} } }] },
        });

      const result = await sheetApi.ensureTab('newTab', ['col1', 'col2']);
      expect(result).toBe('newTab');
      expect(mockSheets.spreadsheets.batchUpdate).toHaveBeenCalled();
      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalled();
    });
  });

  describe('getValues', () => {
    it('returns values from sheet', async () => {
      const values = await sheetApi.getValues('myTab');
      expect(values).toEqual([['h1', 'h2'], ['a', 'b']]);
      expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledWith(
        expect.objectContaining({ range: 'myTab!A1:Z10000' })
      );
    });

    it('uses custom range when provided', async () => {
      await sheetApi.getValues('myTab', 'myTab!A1:C10');
      expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledWith(
        expect.objectContaining({ range: 'myTab!A1:C10' })
      );
    });

    it('returns empty array when no values', async () => {
      mockSheets.spreadsheets.values.get.mockResolvedValueOnce({ data: {} });
      const values = await sheetApi.getValues('empty');
      expect(values).toEqual([]);
    });
  });

  describe('appendRow', () => {
    it('appends row to tab', async () => {
      await sheetApi.appendRow('myTab', ['val1', 'val2']);
      expect(mockSheets.spreadsheets.values.append).toHaveBeenCalledWith(
        expect.objectContaining({
          range: 'myTab!A1',
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [['val1', 'val2']] },
        })
      );
    });
  });

  describe('setValues', () => {
    it('writes values to specified range', async () => {
      await sheetApi.setValues('myTab!A1', [['a', 'b'], ['c', 'd']]);
      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalledWith(
        expect.objectContaining({
          range: 'myTab!A1',
          valueInputOption: 'RAW',
          requestBody: { values: [['a', 'b'], ['c', 'd']] },
        })
      );
    });
  });

  describe('clearTab', () => {
    it('clears data rows but keeps headers', async () => {
      await sheetApi.clearTab('existing', true);
      expect(mockSheets.spreadsheets.batchUpdate).toHaveBeenCalled();
    });

    it('clears entire tab when keepHeaders is false', async () => {
      await sheetApi.clearTab('existing', false);
      expect(mockSheets.spreadsheets.values.clear).toHaveBeenCalled();
    });

    it('does nothing when tab does not exist', async () => {
      mockSheets.spreadsheets.get.mockResolvedValueOnce({ data: { sheets: [] } });
      await sheetApi.clearTab('nonexistent');
      expect(mockSheets.spreadsheets.batchUpdate).not.toHaveBeenCalled();
      expect(mockSheets.spreadsheets.values.clear).not.toHaveBeenCalled();
    });
  });

  describe('getCell', () => {
    it('returns single cell value', async () => {
      mockSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [['cell-value']] },
      });
      const value = await sheetApi.getCell('myTab', 'B3');
      expect(value).toBe('cell-value');
    });

    it('returns undefined for empty cell', async () => {
      mockSheets.spreadsheets.values.get.mockResolvedValueOnce({ data: {} });
      const value = await sheetApi.getCell('myTab', 'A1');
      expect(value).toBeUndefined();
    });
  });

  describe('setCell', () => {
    it('writes single value to cell', async () => {
      await sheetApi.setCell('myTab', 'B5', 42);
      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalledWith(
        expect.objectContaining({
          range: 'myTab!B5',
          requestBody: { values: [[42]] },
        })
      );
    });
  });
});
