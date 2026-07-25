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
    
    sheet.getRange("B5").setNumberFormat("0");
    sheet.getRange("B4").setNumberFormat("@");
    sheet.getRange("B8:B13").setNumberFormat("#,##0");
    sheet.getRange("B16").setNumberFormat("#,##0");
    
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 120);
    sheet.setColumnWidth(3, 300);
    
    Debug.log("Dashboard.init", "Dashboard tab created");
    this.refresh();
  },
  /**
   * Refresh all dashboard values.
   */
  refresh: function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(this.TAB);
    if (!sheet) {
      this.init();
      sheet = ss.getSheetByName(this.TAB);
    }
    
    var month = sheet.getRange("B4").getValue();
    var target = Number(sheet.getRange("B5").getValue()) || 4000;
    
    if (!month || typeof month !== "string" || month.indexOf("-") === -1) {
      Debug.log("Dashboard.refresh", "Invalid month format in B4. Use YYYY-MM.");
      return;
    }
    
    var parts = month.split("-");
    var year = parseInt(parts[0]);
    var monthNum = parseInt(parts[1]);
    
    var monthStart = new Date(year, monthNum - 1, 1);
    var monthEnd = new Date(year, monthNum, 0);
    var today = new Date();
    var daysRemaining = Math.max(0, Math.ceil((monthEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    
    var startStr = Utilities.formatDate(monthStart, Session.getScriptTimeZone(), "yyyy-MM-dd");
    var endStr = Utilities.formatDate(monthEnd, Session.getScriptTimeZone(), "yyyy-MM-dd");
    
    Debug.log("Dashboard.refresh", "Calculating for: " + startStr + " to " + endStr);
    
    var spend = this.calculateSpend(startStr, endStr);
    sheet.getRange("B8").setValue(spend);
    
    var interviewIncome = this.calculateInterviewIncome(startStr, endStr);
    sheet.getRange("B9").setValue(interviewIncome);
    
    var manualAdjustments = this.calculateManualAdjustments(startStr, endStr);
    sheet.getRange("B10").setValue(manualAdjustments);
    
    var netIncome = 9000 + interviewIncome + manualAdjustments - spend;
    sheet.getRange("B11").setValue(netIncome);
    
    var dailyBudget = daysRemaining > 0 ? (netIncome - target) / daysRemaining : 0;
    sheet.getRange("B13").setValue(Math.round(dailyBudget));
    sheet.getRange("C13").setValue("Target: $" + target + ", " + daysRemaining + " days left");
    
    Debug.log("Dashboard.refresh", "Spend: $" + spend + " | Net: $" + netIncome + " | Daily: $" + Math.round(dailyBudget));
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
    Debug.log("Dashboard.calculateSpend", "Data rows: " + (data.length - 1) + ", date range: " + startDate + " to " + endDate);
    var matchedDate = 0, matchedCategory = 0, matchedAmount = 0;
    for (var r = 1; r < data.length; r++) {
      var rawDate = data[r][2];
      var amount = Number(data[r][5]) || 0;
      var category = String(data[r][6] || "");
      
      // Dates come from getValues() as Date objects — format them for comparison
      var date = "";
      if (rawDate instanceof Date) {
        date = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        date = String(rawDate || "");
      }
      
      if (date < startDate || date > endDate) continue;
      matchedDate++;
      
      // Skip transfers (Plaid categories: TRANSFER, LOAN_PAYMENTS)
      if (category === "TRANSFER" || category === "LOAN_PAYMENTS") { matchedCategory++; continue; }
      
      if (amount > 0) {
        total += amount;
        matchedAmount++;
      }
    }
    Debug.log("Dashboard.calculateSpend", "Matched: " + matchedDate + " in date range, " + matchedCategory + " skipped as transfers, " + matchedAmount + " with positive amount");
    
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

