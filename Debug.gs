/**
 * Debug.gs — Centralized logging system
 * 
 * Every function writes to a hidden "debug" tab so errors and API responses
 * are visible without needing the Apps Script editor's Logger.
 * 
 * Usage:  Debug.log("fetchTransactions", "Request started")
 *         Debug.logRaw("fetchTransactions", response)
 */

const Debug = {
  SHEET_NAME: "debug",
  
  /**
   * Ensures the hidden debug tab exists. Call once at startup.
   */
  ensureTab: function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(this.SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(this.SHEET_NAME);
      sheet.setHidden(true);
      sheet.appendRow(["timestamp", "function", "message"]);
      sheet.setFrozenRows(1);
    }
    return sheet;
  },

  /**
   * Append a timestamped log entry.
   */
  log: function (fn, message) {
    const sheet = this.ensureTab();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([timestamp, fn, message]);
    // Also log to StackDriver for Apps Script's built-in logger
    console.log(`[${fn}] ${message}`);
  },

  /**
   * Append a JSON-dumped object (API response, error stack, etc.)
   */
  logRaw: function (fn, data) {
    const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    this.log(fn, json);
  },

  /**
   * Log an error with stack trace.
   */
  error: function (fn, err) {
    this.log(fn, `ERROR: ${err.message || err}`);
    if (err.stack) {
      this.log(fn, `STACK: ${err.stack}`);
    }
    console.error(`[${fn}] ${err.message || err}`);
  }
};
