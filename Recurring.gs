/**
 * Recurring.gs — Track expected monthly bills.
 *
 * Columns: merchant_name, amount, day_of_month, notes
 *
 * The dashboard shows "Upcoming Bills" = expected bills whose day_of_month
 * is >= today AND whose merchant hasn't already posted a transaction this month.
 * No manual marking required — matching is automatic by merchant name.
 */

const RECURRING = {
  TAB: "recurring",
  HEADERS: ["merchant_name", "amount", "day_of_month", "notes"],

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
   * Excludes bills whose merchant already posted a transaction this month.
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
    var dayCol = header.indexOf("day_of_month");
    if (merchCol < 0 || amtCol < 0 || dayCol < 0) {
      Debug.error("Recurring.calculateUpcoming", "recurring tab missing required columns");
      return { upcoming: 0, items: [] };
    }

    // Build set of merchant names already seen in transactions this month
    var paidMerchants = this.findPaidMerchants(year, monthNum);

    var upcomingTotal = 0;
    var upcomingItems = [];
    for (var r = 1; r < data.length; r++) {
      var merchant = String(data[r][merchCol] || "").toLowerCase().trim();
      var amount = Number(data[r][amtCol]) || 0;
      var day = Number(data[r][dayCol]) || 0;

      if (day < 1 || day > 31 || amount <= 0) continue;
      if (day < today.getDate()) continue; // already passed

      // Check if this merchant already posted this month
      var alreadyPaid = false;
      for (var p = 0; p < paidMerchants.length; p++) {
        if (paidMerchants[p].indexOf(merchant) >= 0 || merchant.indexOf(paidMerchants[p]) >= 0) {
          alreadyPaid = true;
          break;
        }
      }
      if (alreadyPaid) continue;

      upcomingTotal += amount;
      upcomingItems.push({ merchant: merchant, amount: amount, day: day });
    }

    Debug.log("Recurring.calculateUpcoming", "Upcoming bills: " + upcomingItems.length + ", total: " + upcomingTotal);
    return { upcoming: upcomingTotal, items: upcomingItems };
  },

  /**
   * Find merchant names from transactions that posted this month.
   */
  findPaidMerchants: function (year, monthNum) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var txSheet = ss.getSheetByName("transactions");
    if (!txSheet) return [];

    var data = txSheet.getDataRange().getValues();
    if (data.length < 2) return [];

    var header = [];
    for (var h = 0; h < data[0].length; h++) header.push(String(data[0][h]));
    var dateCol = header.indexOf("date");
    var merchCol = header.indexOf("merchant_name");
    var nameCol = header.indexOf("name");
    if (dateCol < 0) return [];

    var monthStart = Utilities.formatDate(new Date(year, monthNum - 1, 1), Session.getScriptTimeZone(), "yyyy-MM-dd");
    var monthEnd = Utilities.formatDate(new Date(year, monthNum, 0), Session.getScriptTimeZone(), "yyyy-MM-dd");

    var merchants = [];
    for (var r = 1; r < data.length; r++) {
      var rawDate = data[r][dateCol];
      var date = "";
      if (rawDate instanceof Date) {
        date = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        date = String(rawDate || "");
      }
      if (date < monthStart || date > monthEnd) continue;

      var m = String(data[r][merchCol] || "").toLowerCase().trim();
      var n = String(data[r][nameCol] || "").toLowerCase().trim();
      if (m) merchants.push(m);
      if (n && n !== m) merchants.push(n);
    }

    return merchants;
  }
};

function initRecurring() {
  RECURRING.init();
}
