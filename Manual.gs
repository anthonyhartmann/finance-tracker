/**
 * Manual.gs — Manual adjustments tab: create, append, and manage off-budget entries.
 *
 * Columns: id, date, description, amount, category, status, notes, created_at
 * Positive amount = money in; Negative = money out.
 */

const MANUAL = {
  TAB: "adjustments",
  HEADERS: ["id", "date", "description", "amount", "category", "status", "notes", "created_at"],

  /**
   * Ensure the adjustments tab exists with proper headers.
   */
  init: function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(this.TAB);
    if (!sheet) {
      sheet = ss.insertSheet(this.TAB);
      sheet.appendRow(this.HEADERS);
      sheet.setFrozenRows(1);
      Debug.log("Manual.init", "Created tab: " + this.TAB);
    }
    return sheet;
  },

  /**
   * Append a manual adjustment row.
   *
   * @param {string} date        YYYY-MM-DD
   * @param {string} description What happened
   * @param {number} amount      Positive = in, Negative = out
   * @param {string} category    Cash, Refund, Reimbursement, etc.
   * @param {string} status      pending, cleared, reconciled
   * @param {string} notes       Optional extra context
   */
  addAdjustment: function (date, description, amount, category, status, notes) {
    var sheet = this.init();
    var id = sheet.getLastRow(); // simple row-number id
    var createdAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

    var row = [id, date, description, amount, category || "", status || "", notes || "", createdAt];
    sheet.appendRow(row);

    Debug.log("Manual.addAdjustment", "Added row " + id + ": " + description + " ($" + amount + ")");

    // Auto-refresh dashboard if it's open
    try {
      DASHBOARD.refresh();
    } catch (e) {
      // ignore if dashboard not ready
    }
  }
};

function initAdjustments() {
  MANUAL.init();
}

function addAdjustment(date, description, amount, category, status, notes) {
  MANUAL.addAdjustment(date, description, amount, category, status, notes);
}
