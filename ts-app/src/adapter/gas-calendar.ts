import type { ICalendarAdapter } from './types';

export const gasCalendar: ICalendarAdapter = {
  getCalendarId(): string {
    return PropertiesService.getScriptProperties().getProperty('CALENDAR_ID') || 'primary';
  },

  listEvents(daysBack: number, daysForward: number): Promise<{ summary: string; description: string; startDate: Date }[]> {
    const props = PropertiesService.getScriptProperties();
    const calId = props.getProperty('CALENDAR_ID') || 'primary';
    const cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
    if (!cal) return Promise.resolve([]);
    const now = new Date();
    const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);
    const events = cal.getEvents(start, end);
    return Promise.resolve(events.map(e => ({
      summary: e.getTitle(),
      description: e.getDescription(),
      startDate: e.getStartTime() as unknown as Date,
    })));
  },
};
