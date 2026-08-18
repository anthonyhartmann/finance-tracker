import { google } from 'googleapis';
import { authorize } from '../google-auth';
import type { ICalendarAdapter } from './types';

const NODE_CONFIG_PATH = (() => { try { return require('path').join(__dirname, '..', '..', 'local-config.json'); } catch { return ''; } })();

export const nodeCalendar: ICalendarAdapter = {
  getCalendarId(): string {
    try {
      const fs = require('fs');
      if (fs.existsSync(NODE_CONFIG_PATH)) {
        const cfg = JSON.parse(fs.readFileSync(NODE_CONFIG_PATH, 'utf8'));
        return cfg.CALENDAR_ID || 'primary';
      }
    } catch {}
    return process.env.CALENDAR_ID || 'primary';
  },

  async listEvents(daysBack: number, daysForward: number): Promise<Array<{ summary: string; description: string; location?: string; startDate: Date }>> {
    const { auth } = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();
    const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);
    const res = await calendar.events.list({
      calendarId: this.getCalendarId(),
      timeMin: start.toISOString(), timeMax: end.toISOString(),
      singleEvents: true, orderBy: 'startTime',
    });
    const events = res.data.items || [];
    return events.map(e => ({
      summary: e.summary || '',
      description: e.description || '',
      location: e.location || '',
      startDate: new Date(e.start?.dateTime || e.start?.date || ''),
    }));
  },
};
