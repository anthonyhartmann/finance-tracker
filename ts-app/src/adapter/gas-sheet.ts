/** GAS sheet adapter — wraps synchronous SpreadsheetApp in Promises. */
import type { CellValue } from '../types';
import type { ISheetAdapter } from './types';

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

export const gasSheet: ISheetAdapter = {
  ensureTab(tabName: string, headers: string[]): Promise<string> {
    const s = ss();
    let sheet = s.getSheetByName(tabName);
    if (!sheet) {
      sheet = s.insertSheet(tabName);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      console.log('Created tab: ' + tabName);
    }
    return Promise.resolve(tabName);
  },

  getValues(tabName: string, range?: string): Promise<CellValue[][]> {
    const s = ss();
    const sheet = s.getSheetByName(tabName);
    if (!sheet) return Promise.resolve([]);
    if (range) {
      return Promise.resolve(sheet.getRange(range).getValues() as CellValue[][]);
    }
    return Promise.resolve(sheet.getDataRange().getValues() as CellValue[][]);
  },

  appendRow(tabName: string, row: CellValue[]): Promise<void> {
    const s = ss();
    let sheet = s.getSheetByName(tabName);
    if (!sheet) sheet = s.insertSheet(tabName);
    sheet.appendRow(row);
    return Promise.resolve();
  },

  setValues(rangeExpr: string, values: CellValue[][]): Promise<void> {
    const parts = rangeExpr.split('!');
    const tabName = parts[0];
    const a1 = parts[1] || 'A1';
    const s = ss();
    let sheet = s.getSheetByName(tabName);
    if (!sheet) sheet = s.insertSheet(tabName);
    if (values.length === 0) return Promise.resolve();
    
    const numRows = values.length;
    const numCols = values[0].length;
    
    // Parse the starting cell (e.g., 'A1' -> column 1, row 1)
    const match = a1.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      throw new Error('Invalid range format: ' + a1);
    }
    const startColStr = match[1];
    const startRow = parseInt(match[2], 10);
    
    // Convert column letters to number (A=1, B=2, ..., Z=26, AA=27, etc.)
    let startCol = 0;
    for (let i = 0; i < startColStr.length; i++) {
      startCol = startCol * 26 + (startColStr.charCodeAt(i) - 64);
    }
    
    // Calculate end column
    const endCol = startCol + numCols - 1;
    const endRow = startRow + numRows - 1;
    
    // Convert end column number back to letters
    let endColStr = '';
    let col = endCol;
    while (col > 0) {
      const mod = (col - 1) % 26;
      endColStr = String.fromCharCode(65 + mod) + endColStr;
      col = Math.floor((col - 1) / 26);
    }
    
    const range = sheet.getRange(startRow, startCol, numRows, numCols);
    range.setValues(values);
    return Promise.resolve();
  },

  clearTab(tabName: string, keepHeaders?: boolean): Promise<void> {
    const s = ss();
    const sheet = s.getSheetByName(tabName);
    if (!sheet) return Promise.resolve();
    if (keepHeaders) {
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return Promise.resolve();
      sheet.getRange(2, 1, data.length - 1, data[0].length).clearContent();
    } else {
      sheet.clearContents();
    }
    return Promise.resolve();
  },

  getCell(tabName: string, a1: string): Promise<CellValue | undefined> {
    const s = ss();
    const sheet = s.getSheetByName(tabName);
    if (!sheet) return Promise.resolve(undefined);
    return Promise.resolve(sheet.getRange(a1).getValue() as CellValue);
  },

  setCell(tabName: string, a1: string, value: CellValue): Promise<void> {
    const s = ss();
    let sheet = s.getSheetByName(tabName);
    if (!sheet) sheet = s.insertSheet(tabName);
    sheet.getRange(a1).setValue(value);
    return Promise.resolve();
  },

  copySheet(sourceName: string, destName: string): Promise<number | null> {
    const s = ss();
    const src = s.getSheetByName(sourceName);
    if (!src) { console.log('Source sheet "' + sourceName + '" not found'); return Promise.resolve(null); }
    const existing = s.getSheetByName(destName);
    if (existing) s.deleteSheet(existing);
    const copy = src.copyTo(s);
    copy.setName(destName);
    console.log('Copied sheet "' + sourceName + '" -> "' + destName + '"');
    return Promise.resolve(1);
  },

  deleteSheet(tabName: string): Promise<void> {
    const s = ss();
    const sheet = s.getSheetByName(tabName);
    if (sheet) s.deleteSheet(sheet);
    return Promise.resolve();
  },

  renameSheet(oldName: string, newName: string): Promise<void> {
    const s = ss();
    const sheet = s.getSheetByName(oldName);
    if (sheet) sheet.setName(newName);
    return Promise.resolve();
  },
};
