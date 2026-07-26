/**
 * Manual.gs — Manual adjustments tab: dead simple.
 *
 * Columns: date, description, amount
 * Positive amount = money in; Negative = money out.
 */

const MANUAL = {
  TAB: "adjustments",
  HEADERS: ["date", "description", "amount"],

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
   * Append a manual adjustment row. Date defaults to today.
   *
   * @param {number} amount      Positive = in, Negative = out
   * @param {string} description What happened (optional)
   * @param {string} date        YYYY-MM-DD (optional, defaults to today)
   */
  addAdjustment: function (amount, description, date) {
    var sheet = this.init();
    date = date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    description = description || "";

    var row = [date, description, amount];
    sheet.appendRow(row);

    Debug.log("Manual.addAdjustment", "Added: " + description + " ($" + amount + ") on " + date);

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

function addAdjustment(amount, description, date) {
  MANUAL.addAdjustment(amount, description, date);
}
