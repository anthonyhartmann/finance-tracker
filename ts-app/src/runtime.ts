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

/**
 * Format raw date cell values (Date objects from GAS, strings, ISO timestamps, M/D/YYYY)
 * into YYYY-MM-DD in the given/configured timezone.
 */
export function formatDateCell(rawDate: unknown, tz?: string): string {
  if (!rawDate) return '';
  const zone = tz || getTimezone();
  if (rawDate instanceof Date) {
    return rawDate.toLocaleDateString('en-CA', { timeZone: zone });
  }
  const s = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    if (s.includes('T')) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-CA', { timeZone: zone });
      }
    }
    return s.substring(0, 10);
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    const da = Number(m[2]);
    const y = m[3];
    return y + '-' + (mo < 10 ? '0' + mo : String(mo)) + '-' + (da < 10 ? '0' + da : String(da));
  }
  return s;
}
