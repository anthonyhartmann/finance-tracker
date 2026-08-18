import { calendar as calAdapter } from '../adapter';
import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import { getTimezone } from '../runtime';

const TAB = 'interview_income';

export async function parseCalendarEvents(daysBack?: number, daysForward?: number): Promise<void> {
  const db = daysBack || 90;
  const df = daysForward || 30;

  const events = calAdapter.listEvents(db, df);
  const resolved = events instanceof Promise ? await events : events;

  await Debug.log('Calendar.parseCalendarEvents', 'Scanning ' + resolved.length + ' events');

  const now = new Date();
  const interviews: { date: string; title: string; status: 'Past' | 'Upcoming' }[] = [];

  for (const e of resolved) {
    if (!looksLikeInterview(e)) continue;
    const tz = getTimezone();
    const dateStr = e.startDate.toLocaleDateString('en-CA', { timeZone: tz });
    const status: 'Past' | 'Upcoming' = e.startDate < now ? 'Past' : 'Upcoming';
    interviews.push({ date: dateStr, title: e.summary, status });
  }

  await Debug.log('Calendar.parseCalendarEvents', 'Found ' + interviews.length + ' interview events');

  const headers = ['date', 'title', 'status'];
  await sheetApi.ensureTab(TAB, headers);
  const rows = interviews.map(iv => [iv.date, iv.title, iv.status]);
  await sheetApi.clearTab(TAB, true);
  await sheetApi.setValues(TAB + '!A1', [headers]);
  if (rows.length > 0) await sheetApi.setValues(TAB + '!A2', rows);

  await Debug.log('Calendar.parseCalendarEvents', 'Wrote ' + rows.length + ' rows to ' + TAB);
}

export async function dumpCalendarEvents(daysBack?: number, daysForward?: number): Promise<void> {
  const db = daysBack || 30;
  const df = daysForward || 30;
  const events = calAdapter.listEvents(db, df);
  const resolved = events instanceof Promise ? await events : events;
  await Debug.log('Calendar.dumpCalendarEvents', 'Found ' + resolved.length + ' events');
  for (const e of resolved) {
    const dateStr = e.startDate.toLocaleDateString('en-CA');
    await Debug.log('Calendar.dumpCalendarEvents', dateStr + ' | ' + e.summary + ' | ' + e.description.substring(0, 60));
  }
}

function looksLikeInterview(event: { summary: string; description: string; location?: string }): boolean {
  const combined = (event.summary + ' ' + event.description + ' ' + (event.location || '')).toLowerCase();

  // Match Interview Kickstart side-job interview events:
  // 1. Explicit Interview Kickstart link or name in location/description/summary
  if (combined.includes('interviewkickstart') || combined.includes('interview kickstart')) {
    return true;
  }

  // 2. Standardized candidate interview title format: "Interview with <Candidate Name>"
  if (event.summary.toLowerCase().includes('interview with ')) {
    return true;
  }

  return false;
}
