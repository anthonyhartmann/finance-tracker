/**
 * runtime.test.ts — Tests for runtime environment helpers.
 */

import { getTimezone, formatDateCell } from './runtime';

describe('getTimezone', () => {
  const origSession = (global as any).Session;
  const origProcess = process.env.TIMEZONE;

  afterEach(() => {
    // Restore globals
    if (origSession === undefined) {
      delete (global as any).Session;
    } else {
      (global as any).Session = origSession;
    }
    if (origProcess === undefined) {
      delete process.env.TIMEZONE;
    } else {
      process.env.TIMEZONE = origProcess;
    }
  });

  it('returns process.env.TIMEZONE when set and no Session global', () => {
    delete (global as any).Session;
    process.env.TIMEZONE = 'US/Pacific';
    expect(getTimezone()).toBe('US/Pacific');
  });

  it('returns Session.getScriptTimeZone() when Session global exists', () => {
    (global as any).Session = {
      getScriptTimeZone: () => 'America/Chicago',
    };
    process.env.TIMEZONE = 'US/Pacific'; // should be ignored
    expect(getTimezone()).toBe('America/Chicago');
  });

  it('falls back to America/New_York when nothing is available', () => {
    delete (global as any).Session;
    delete process.env.TIMEZONE;
    expect(getTimezone()).toBe('America/New_York');
  });

  it('falls back when Session.getScriptTimeZone throws', () => {
    (global as any).Session = {
      getScriptTimeZone: () => { throw new Error('not available'); },
    };
    delete process.env.TIMEZONE;
    expect(getTimezone()).toBe('America/New_York');
  });

  it('falls back when Session.getScriptTimeZone returns empty', () => {
    (global as any).Session = {
      getScriptTimeZone: () => '',
    };
    delete process.env.TIMEZONE;
    // empty string is falsy, so should fall through
    expect(getTimezone()).toBe('America/New_York');
  });
});

describe('formatDateCell', () => {
  it('returns empty string for falsy values', () => {
    expect(formatDateCell(null)).toBe('');
    expect(formatDateCell(undefined)).toBe('');
    expect(formatDateCell('')).toBe('');
  });

  it('formats Date objects in the target timezone without UTC shift', () => {
    const d = new Date('2026-08-01T12:00:00');
    expect(formatDateCell(d, 'America/New_York')).toBe('2026-08-01');
  });

  it('formats M/D/YYYY string dates correctly', () => {
    expect(formatDateCell('8/1/2026')).toBe('2026-08-01');
    expect(formatDateCell('12/31/2026')).toBe('2026-12-31');
  });

  it('formats YYYY-MM-DD string dates correctly', () => {
    expect(formatDateCell('2026-08-01')).toBe('2026-08-01');
  });

  it('formats ISO timestamps with time component in timezone', () => {
    expect(formatDateCell('2026-08-01T12:00:00.000Z', 'America/New_York')).toBe('2026-08-01');
  });
});
