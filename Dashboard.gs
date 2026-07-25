/**
 * Dashboard.gs — The 3 numbers: Actual Spend, Net Income, Daily Budget
 * 
 * All formulas read from the transactions tab and respect the month selector.
 */

const DASHBOARD = {
  TAB: "dashboard",
  
  /**
   * Initialize the dashboard tab with all cells and headers.
   */
  init: function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(this.TAB);
    if (!sheet) {
      sheet = ss.insertSheet(this.TAB);
    }
    sheet.clear();
    
    var layout = [
      ["Finance Tracker Dashboard", "", ""],
      ["", "", ""],
      ["Controls", "", ""],
      ["Month (YYYY-MM)", new Date().getFullYear() + "-" + padMonth(new Date().getMonth() + 1), ""],
      ["Monthly Target", 4000, ""],
      ["", "", ""],
      ["The 3 Numbers", "", ""],
      ["Actual Spend", "", "Money out (excl transfers)"],
      ["Interview Income", "", "From Calendar parser"],
      ["Manual Adjustments", "", "Refunds, cash, corrections"],
      ["Net Income", "", "9000 + interviews + manual - spend"],
      ["", "", ""],
      ["Daily Budget", "", "(Net Income - target) / days remaining"],
      ["", "", ""],
      ["Balances (live from Plaid)", "", ""],
      ["Total Available Balance", "", "Sum of all account balances"],
    ];
    
    for (var r = 0; r < layout.length; r++) {
      sheet.getRange(r + 1, 1, 1, 3).setValues([layout[r]]);
    }
    
    sheet.getRange("A1").setFontWeight("bold");
    sheet.getRange("A3").setFontWeight("bold");
    sheet.getRange("A7").setFontWeight("bold");
    sheet.getRange("A15").setFontWeight("bold");
    
    sheet.getRange("B4:B5").setNumberFormat("0");
    sheet.getRange("B8:B13").setNumberFormat("#,##0");
    sheet.getRange("B16").setNumberFormat("#,##0");
    
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 120);
    sheet.setColumnWidth(3, 300);
    
    Debug.log("Dashboard.init", "Dashboard tab created");
    this.refresh();
  },
  /**
   * Calculate total spend for a month from the transactions tab.
   * Excludes transfers between own accounts.
   */
  calculateSpend: function (startDate, endDate) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("transactions");
    if (!sheet) return 0;
    
    var data = sheet.getDataRange().getValues();
    var total = 0;
    
    // Headers: transaction_id, account_id, date, name, merchant_name, amount, category, payment_channel, pending, currency, synced_at
    for (var r = 1; r < data.length; r++) {
      var date = String(data[r][2] || "");
      var amount = Number(data[r][5]) || 0;
      var category = String(data[r][6] || "");
      
      if (date < startDate || date > endDate) continue;
      
      // Skip transfers (Plaid categories: TRANSFER, LOAN_PAYMENTS)
      if (category === "TRANSFER" || category === "LOAN_PAYMENTS") continue;
      
      if (amount > 0) {
        total += amount;
      }
    }
    
    return total;
  },
  
  /**
   * Calculate interview income. Returns 0 until Calendar parser is built.
   */
  calculateInterviewIncome: function (startDate, endDate) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("interview_income");
    if (!sheet) return 0;
    
    var data = sheet.getDataRange().getValues();
    var total = 0;
    for (var r = 1; r < data.length; r++) {
      total += Number(data[r][4]) || 0;
    }
    return total;
  },
  
  /**
   * Calculate manual adjustments.
   */
  calculateManualAdjustments: function (startDate, endDate) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("adjustments");
    if (!sheet) return 0;
    
    var data = sheet.getDataRange().getValues();
    var total = 0;
    for (var r = 1; r < data.length; r++) {
      var date = String(data[r][1] || "");
      var amount = Number(data[r][3]) || 0;
      if (date >= startDate && date <= endDate) {
        total += amount;
      }
    }
    return total;
  }
};

function padMonth(m) {
  return m < 10 ? "0" + m : String(m);
}

function initDashboard() {
  DASHBOARD.init();
}

function refreshDashboard() {
  DASHBOARD.refresh();
}

