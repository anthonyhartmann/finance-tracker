/** Node sheet adapter — lazy-loads googleapis to allow tree-shaking in GAS builds. */
import type { CellValue } from '../types';
import type { ISheetAdapter } from './types';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
let _sheets: any = null;
let _sheetIdCache: Record<string, number | null> = {};

async function getSheets(): Promise<any> {
  if (_sheets) return _sheets;
  const { google } = await import('googleapis');
  const { authorize } = await import('../google-auth');
  const { auth } = await authorize();
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

async function getSheetId(tabName: string): Promise<number | null> {
  if (_sheetIdCache[tabName] !== undefined) return _sheetIdCache[tabName];
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = res.data.sheets?.find((s: any) => s.properties?.title === tabName);
  _sheetIdCache[tabName] = sheet?.properties?.sheetId ?? null;
  return _sheetIdCache[tabName];
}

export const nodeSheet: ISheetAdapter = {
  async ensureTab(tabName, headers) {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existing = res.data.sheets?.find((s: any) => s.properties?.title === tabName);
    if (!existing) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: tabName + '!A1', valueInputOption: 'RAW', requestBody: { values: [headers] },
      });
      _sheetIdCache = {};
      const fresh = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const sheetId = fresh.data.sheets?.find((s: any) => s.properties?.title === tabName)?.properties?.sheetId;
      if (sheetId !== undefined && sheetId !== null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }] },
        });
      }
      console.log('Created tab: ' + tabName);
    }
    return tabName;
  },

  async getValues(tabName, range) {
    const sheets = await getSheets();
    const r = range || tabName + '!A1:Z10000';
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: r, valueRenderOption: 'UNFORMATTED_VALUE' });
    return res.data.values || [];
  },

  async appendRow(tabName, row) {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID, range: tabName + '!A1',
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] },
    });
  },

  async setValues(rangeExpr, values) {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: rangeExpr, valueInputOption: 'RAW', requestBody: { values },
    });
  },

  async clearTab(tabName, keepHeaders) {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = res.data.sheets?.find((s: any) => s.properties?.title === tabName);
    if (!sheet) return;
    const sheetId = sheet.properties!.sheetId!;
    const rowCount = sheet.properties!.gridProperties!.rowCount || 1000;
    if (keepHeaders !== false) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: rowCount } } }] },
      });
    } else {
      await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: tabName + '!A1:Z' + rowCount });
    }
  },

  async getCell(tabName, a1) {
    const values = await this.getValues(tabName, tabName + '!' + a1);
    if (!values || values.length === 0) return undefined;
    return values[0][0];
  },

  async setCell(tabName, a1, value) {
    await this.setValues(tabName + '!' + a1, [[value]]);
  },

  async copySheet(sourceName, destName) {
    const sheets = await getSheets();
    const sourceId = await getSheetId(sourceName);
    if (sourceId === null) { console.log('Source "' + sourceName + '" not found'); return null; }
    const destId = await getSheetId(destName);
    if (destId !== null) await this.deleteSheet(destName);
    const res = await sheets.spreadsheets.sheets.copyTo({
      spreadsheetId: SPREADSHEET_ID, sheetId: sourceId, requestBody: { destinationSpreadsheetId: SPREADSHEET_ID },
    });
    const newId = res.data.sheetId ?? null;
    if (newId !== null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: newId, title: destName }, fields: 'title' } }] },
      });
      console.log('Copied "' + sourceName + '" -> "' + destName + '"');
    }
    return newId;
  },

  async deleteSheet(tabName) {
    const sheets = await getSheets();
    const sheetId = await getSheetId(tabName);
    if (sheetId === null) return;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ deleteSheet: { sheetId } }] },
    });
    console.log('Deleted: ' + tabName);
  },

  async renameSheet(oldName, newName) {
    const sheets = await getSheets();
    const sheetId = await getSheetId(oldName);
    if (sheetId === null) { console.log('Sheet "' + oldName + '" not found'); return; }
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId, title: newName }, fields: 'title' } }] },
    });
    console.log('Renamed "' + oldName + '" -> "' + newName + '"');
  },
};
