import type { CellValue, CalendarEvent } from '../types';

export interface ISheetAdapter {
  ensureTab(tabName: string, headers: string[]): Promise<string>;
  getValues(tabName: string, range?: string): Promise<CellValue[][]>;
  appendRow(tabName: string, row: CellValue[]): Promise<void>;
  setValues(range: string, values: CellValue[][]): Promise<void>;
  clearTab(tabName: string, keepHeaders?: boolean): Promise<void>;
  getCell(tabName: string, a1Notation: string): Promise<CellValue | undefined>;
  setCell(tabName: string, a1Notation: string, value: CellValue): Promise<void>;
  copySheet(sourceName: string, destName: string): Promise<number | null>;
  deleteSheet(tabName: string): Promise<void>;
  renameSheet(oldName: string, newName: string): Promise<void>;
}

export interface IConfigAdapter {
  getProperty(key: string): string | null;
  setProperty(key: string, value: string): void;
  deleteProperty(key: string): void;
  getKeys(): string[];
}

export interface ICalendarAdapter {
  getCalendarId(): string;
  listEvents(daysBack: number, daysForward: number): Promise<Array<{ summary: string; description: string; location?: string; startDate: Date }>>;
}

export interface IHttpAdapter {
  postJson(url: string, body: Record<string, unknown>): Promise<{ status: number; data: any }>;
}
