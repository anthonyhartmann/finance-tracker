/**
 * runtime.ts — Runtime environment helpers.
 * Provides safe access to environment values that differ between
 * Node.js and Google Apps Script.
 */

export function getTimezone(): string {
  try {
    if (typeof Session !== 'undefined' && Session.getScriptTimeZone) {
      const tz = Session.getScriptTimeZone();
      if (tz) return tz;
    }
  } catch { /* not in GAS */ }
  try {
    if (typeof process !== 'undefined' && process.env && process.env.TIMEZONE) {
      return process.env.TIMEZONE;
    }
  } catch { /* not in Node or restricted */ }
  return 'America/New_York';
}
