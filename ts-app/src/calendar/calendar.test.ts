/**
 * calendar.test.ts — Tests for Google Calendar interview parser.
 */

jest.mock('googleapis');
jest.mock('../google-auth');
jest.mock('../sheet-api');
jest.mock('../debug');
jest.mock('../config');

import { google } from 'googleapis';
import { authorize } from '../google-auth';
import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import * as config from '../config';

const mockGoogle = jest.mocked(google);
const mockAuthorize = jest.mocked(authorize);
const mockSheetApi = jest.mocked(sheetApi);
const mockDebug = jest.mocked(Debug);
const mockConfig = jest.mocked(config);

let mockCalendar: any;

beforeEach(() => {
  jest.clearAllMocks();
  mockDebug.log.mockResolvedValue(undefined);
  mockDebug.error.mockResolvedValue(undefined);
  mockSheetApi.ensureTab.mockResolvedValue('interview_income');
  mockSheetApi.clearTab.mockResolvedValue(undefined);
  mockSheetApi.setValues.mockResolvedValue(undefined);
  mockConfig.getProperty.mockReturnValue('primary');
  mockAuthorize.mockResolvedValue({ auth: {} as Auth.OAuth2Client, type: 'oauth' });

  mockCalendar = {
    events: {
      list: jest.fn().mockResolvedValue({ data: { items: [] } }),
    },
  };
  mockGoogle.calendar = jest.fn().mockReturnValue(mockCalendar) as any;
});

describe('calendar', () => {
  describe('parseCalendarEvents', () => {
    it('filters events that look like interviews', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: [
            { summary: 'Interview with Raymond | Scalable Distributed Systems Interviews', start: { dateTime: pastDate.toISOString() }, description: '' },
            { summary: 'onsite', start: { dateTime: futureDate.toISOString() }, description: '' },
            { summary: 'Lunch with Bob', start: { dateTime: pastDate.toISOString() }, description: '' },
            { summary: 'Interview with Vincent | Data Structures/Algorithms Interviews', start: { dateTime: futureDate.toISOString() }, description: '' },
            { summary: 'Dentist', start: { dateTime: pastDate.toISOString() }, description: '' },
          ],
        },
      });

      const { parseCalendarEvents } = await import('./index');
      await parseCalendarEvents();

      expect(mockSheetApi.setValues).toHaveBeenCalledWith(
        'interview_income!A2',
        expect.arrayContaining([
          expect.arrayContaining(['Interview with Raymond | Scalable Distributed Systems Interviews']),
          expect.arrayContaining(['Interview with Vincent | Data Structures/Algorithms Interviews']),
        ])
      );

      // Should only have 2 interview rows (not onsite, Lunch, or Dentist)
      const dataCall = mockSheetApi.setValues.mock.calls.find(c => c[0] === 'interview_income!A2');
      expect(dataCall![1]).toHaveLength(2);
    });

    it('marks events as Past or Upcoming', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const futureDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: [
            { summary: 'Interview with Alice | Ad-Hoc Interviews', start: { dateTime: pastDate.toISOString() }, description: '' },
            { summary: 'Interview with Bob | Ad-Hoc Interviews', start: { dateTime: futureDate.toISOString() }, description: '' },
          ],
        },
      });

      const { parseCalendarEvents } = await import('./index');
      await parseCalendarEvents();

      const dataCall = mockSheetApi.setValues.mock.calls.find(c => c[0] === 'interview_income!A2');
      expect(dataCall![1]).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['Past']),
          expect.arrayContaining(['Upcoming']),
        ])
      );
    });

    it('handles empty calendar', async () => {
      const { parseCalendarEvents } = await import('./index');
      await parseCalendarEvents();

      expect(mockSheetApi.clearTab).toHaveBeenCalled();
      // No data rows written
      const dataCall = mockSheetApi.setValues.mock.calls.find(c => c[0] === 'interview_income!A2');
      expect(dataCall).toBeUndefined();
    });

    it('detects side job interviews by pattern and interviewkickstart keyword', async () => {
      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: [
            { summary: 'Interview with Sandeep | Frontend System Design Interviews', start: { dateTime: '2026-08-01T10:00:00Z' }, description: '' },
            { summary: 'Interview with Apoorv | Product Management Interviews', start: { dateTime: '2026-08-02T10:00:00Z' }, description: '' },
            { summary: 'Session with candidate', start: { dateTime: '2026-08-03T10:00:00Z' }, description: 'https://uplevel.interviewkickstart.com/interview/12345/' },
            { summary: 'Random Onsite', start: { dateTime: '2026-08-24T10:00:00Z' }, description: 'Regular job interview' },
          ],
        },
      });

      const { parseCalendarEvents } = await import('./index');
      await parseCalendarEvents();

      const dataCall = mockSheetApi.setValues.mock.calls.find(c => c[0] === 'interview_income!A2');
      expect(dataCall![1]).toHaveLength(3);
    });
  });
});
