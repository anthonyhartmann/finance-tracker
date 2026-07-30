/**
 * runtime.test.ts — Tests for runtime environment helpers.
 */

import { getTimezone } from './runtime';

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
