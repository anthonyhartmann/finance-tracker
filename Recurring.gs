/**
 * Recurring.gs — Track expected monthly/weekly bills.
 *
 * Columns: merchant_name, amount, frequency, day_of_month, notes
 *
 * Matching: scans this month's transactions for the merchant name (case-insensitive,
 * partial match in merchant_name or name fields).
 *
 * Monthly: upcoming if 0 matches found this month.
 * Weekly:  expected = 4 per month. upcoming = (4 - matches) * amount.
 */

const RECURRING = {
  TAB: "recurring",
  HEADERS: ["merchant_name", "amount", "frequency", "day_of_month", "notes"],

  init: function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(this.TAB);
    if (!sheet) {
      sheet = ss.insertSheet(this.TAB);
      sheet.appendRow(this.HEADERS);
      sheet.setFrozenRows(1);
      Debug.log("Recurring.init", "Created tab: " + this.TAB);
    }
    return sheet;
  },

  /**
   * Calculate upcoming recurring bills for the current month.
   * @param {number} year
   * @param {number} monthNum  1-12
   * @param {Date}   today
   * @returns {Object} { upcoming: number, items: [] }
   */
  calculateUpcoming: function (year, monthNum, today) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(this.TAB);
    if (!sheet) return { upcoming: 0, items: [] };

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { upcoming: 0, items: [] };

    var header = [];
    for (var h = 0; h < data[0].length; h++) header.push(String(data[0][h]));
    var merchCol = header.indexOf("merchant_name");
    var amtCol = header.indexOf("amount");
    var freqCol = header.indexOf("frequency");
    if (merchCol < 0 || amtCol < 0 || freqCol < 0) {
      Debug.error("Recurring.calculateUpcoming", "recurring tab missing required columns");
      return { upcoming: 0, items: [] };
    }

    var monthStart = Utilities.formatDate(new Date(year, monthNum - 1, 1), Session.getScriptTimeZone(), "yyyy-MM-dd");
    var monthEnd = Utilities.formatDate(new Date(year, monthNum, 0), Session.getScriptTimeZone(), "yyyy-MM-dd");
    var txData = this.getTransactionData(monthStart, monthEnd);

    var upcomingTotal = 0;
    var upcomingItems = [];

    for (var r = 1; r < data.length; r++) {
      var merchant = String(data[r][merchCol] || "").toLowerCase().trim();
      var amount = Number(data[r][amtCol]) || 0;
      var frequency = String(data[r][freqCol] || "").toLowerCase().trim();

      if (!merchant || amount <= 0) continue;

      var postedCount = this.countMatches(merchant, txData);
      var expectedCount = frequency === "weekly" ? 4 : 1;
      var remainingCount = Math.max(0, expectedCount - postedCount);
      var upcomingAmount = Math.round(remainingCount * amount * 100) / 100;

      if (upcomingAmount > 0) {
        upcomingTotal += upcomingAmount;
        upcomingItems.push({
          merchant: merchant,
          amount: amount,
          frequency: frequency,
          remaining: remainingCount,
          upcomingAmount: upcomingAmount
        });
      }
    }

    Debug.log("Recurring.calculateUpcoming", "Upcoming: $" + upcomingTotal + " from " + upcomingItems.length + " bill(s)");
    return { upcoming: upcomingTotal, items: upcomingItems };
  },

  /**
   * Load this month's transaction merchant names for matching.
   */
  getTransactionData: function (startDate, endDate) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("transactions");
    if (!sheet) return [];

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    var header = [];
    for (var h = 0; h < data[0].length; h++) header.push(String(data[0][h]));
    var dateCol = header.indexOf("date");
    var merchCol = header.indexOf("merchant_name");
    var nameCol = header.indexOf("name");
    if (dateCol < 0) return [];

    var results = [];
    for (var r = 1; r < data.length; r++) {
      var rawDate = data[r][dateCol];
      var date = "";
      if (rawDate instanceof Date) {
        date = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        date = String(rawDate || "");
      }
      if (date < startDate || date > endDate) continue;

      results.push({
        merchant_name: String(data[r][merchCol] || ""),
        name: String(data[r][nameCol] || "")
      });
    }
    return results;
  },

  /**
   * Count how many transactions match the given merchant name.
   */
  countMatches: function (searchTerm, txData) {
    var count = 0;
    var term = searchTerm.toLowerCase().trim();
    for (var i = 0; i < txData.length; i++) {
      var merchant = String(txData[i].merchant_name || "").toLowerCase();
      var name = String(txData[i].name || "").toLowerCase();
      if (merchant.indexOf(term) >= 0 || name.indexOf(term) >= 0) {
        count++;
      }
    }
    return count;
  }
};

function initRecurring() {
  RECURRING.init();
}
