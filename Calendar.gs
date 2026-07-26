/**
 * Calendar.gs — Google Calendar interview income parser
 * 
 * Reads interview events from the user's primary Google Calendar
 * and writes them to the interview_income tab. All events are
 * treated as standard ($85) by default; the Dashboard applies
 * rates, tax scalar, and manual overrides.
 */

const CALENDAR = {
  TAB: "interview_income",

  /**
   * Dump recent calendar events to the debug tab for inspection.
   * Run this first to see what your interview event titles look like.
   *
   * @param {number} daysBack   How many days back to scan (default 30)
   * @param {number} daysForward How many days forward to scan (default 30)
   */
  dumpCalendarEvents: function (daysBack, daysForward) {
    daysBack = daysBack || 30;
    daysForward = daysForward || 30;

    var calendar = this.getCalendar();
    if (!calendar) {
      Debug.error("Calendar.dumpCalendarEvents", "Could not access calendar. Ensure Calendar API scope is authorized.");
      return;
    }

    var now = new Date();
    var start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    var end = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);

    var events = calendar.getEvents(start, end);
    Debug.log("Calendar.dumpCalendarEvents", "Found " + events.length + " events from " + start + " to " + end);

    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var dateStr = Utilities.formatDate(e.getStartTime(), Session.getScriptTimeZone(), "yyyy-MM-dd");
      var title = e.getTitle() || "";
      var desc = (e.getDescription() || "").substring(0, 60);
      Debug.log("Calendar.dumpCalendarEvents", dateStr + " | " + title + " | " + desc);
    }
  },

  /**
   * Parse calendar events and write interview events to the interview_income tab.
   * Writes only raw data (date, title, status); Dashboard computes income.
   *
   * @param {number} daysBack   How many days back to scan (default 90)
   * @param {number} daysForward How many days forward to scan (default 30)
   */
  parseCalendarEvents: function (daysBack, daysForward) {
    daysBack = daysBack || 90;
    daysForward = daysForward || 30;

    var calendar = this.getCalendar();
    if (!calendar) {
      Debug.error("Calendar.parseCalendarEvents", "Could not access calendar. Ensure Calendar API scope is authorized.");
      return;
    }

    var now = new Date();
    var start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    var end = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);

    var events = calendar.getEvents(start, end);
    Debug.log("Calendar.parseCalendarEvents", "Scanning " + events.length + " events from " + start + " to " + end);

    var interviews = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var title = e.getTitle() || "";
      var desc = e.getDescription() || "";
      var combined = (title + " " + desc).toLowerCase();

      if (!this.looksLikeInterview(combined)) continue;

      var eventStart = e.getStartTime();
      var dateStr = Utilities.formatDate(eventStart, Session.getScriptTimeZone(), "yyyy-MM-dd");
      var status = eventStart < now ? "Past" : "Upcoming";

      interviews.push({
        date: dateStr,
        title: title,
        status: status
      });
    }

    Debug.log("Calendar.parseCalendarEvents", "Found " + interviews.length + " interview events");

    var headers = ["date", "title", "status"];
    var sheet = SHEET.ensureTab(this.TAB, headers);

    var rows = [];
    for (var j = 0; j < interviews.length; j++) {
      var iv = interviews[j];
      rows.push([iv.date, iv.title, iv.status]);
    }

    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    sheet.setFrozenRows(1);

    Debug.log("Calendar.parseCalendarEvents", "Wrote " + rows.length + " rows to " + this.TAB);
  },

  /**
   * Get the calendar to read from.
   * Reads CALENDAR_ID from ScriptProperties, falls back to default calendar.
   */
  getCalendar: function () {
    var props = PropertiesService.getScriptProperties();
    var calId = props.getProperty("CALENDAR_ID");
    if (calId) {
      return CalendarApp.getCalendarById(calId);
    }
    return CalendarApp.getDefaultCalendar();
  },

  /**
   * Check if an event looks like an interview.
   */
  looksLikeInterview: function (text) {
    var keywords = [
      "interview", "phone screen", "onsite", "loop interview",
      "hiring", "recruiter call", "screening"
    ];
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) >= 0) return true;
    }
    return false;
  },

  /**
   * Set up a daily time-driven trigger for calendar sync.
   * Call once; idempotent (won't create duplicates).
   */
  setupCalendarSyncTrigger: function () {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "parseCalendarEvents") {
        Debug.log("Calendar.setupCalendarSyncTrigger", "Trigger already exists");
        return;
      }
    }

    ScriptApp.newTrigger("parseCalendarEvents")
      .timeBased()
      .everyDays(1)
      .create();

    Debug.log("Calendar.setupCalendarSyncTrigger", "Daily calendar sync trigger created");
  },

  /**
   * Remove all calendar sync triggers.
   */
  removeCalendarSyncTriggers: function () {
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "parseCalendarEvents") {
        ScriptApp.deleteTrigger(triggers[i]);
        removed++;
      }
    }
    Debug.log("Calendar.removeCalendarSyncTriggers", "Removed " + removed + " triggers");
  }
};

function dumpCalendarEvents() {
  CALENDAR.dumpCalendarEvents();
}

function parseCalendarEvents() {
  CALENDAR.parseCalendarEvents();
}

function setupCalendarSyncTrigger() {
  CALENDAR.setupCalendarSyncTrigger();
}

function removeCalendarSyncTriggers() {
  CALENDAR.removeCalendarSyncTriggers();
}
