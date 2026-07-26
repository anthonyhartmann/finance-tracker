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
      ["Net Income", "", "9000 + interviews + manual - spend - recurring"],
      ["", "", ""],
      ["Daily Budget", "", "(Net Income - target) / days remaining"],
      ["Upcoming Bills (unpaid)", "", "From recurring tab"],
      ["Include Upcoming in Spend", 1, "0 = actual only, 1 = include expected bills"],
      ["", "", ""],
      ["Savings Summary", "", ""],
      ["Total Saved", '=SUM(savings_tracker!B2:B)', "All months combined"],
      ["Avg Monthly Savings", '=AVERAGE(savings_tracker!B2:B)', "Average per month"],
      ["Months Saved", '=COUNT(savings_tracker!B2:B)', "Number of months with data"],
      ["", "", ""],
      ["Interview Settings", "", ""],
      ["Standard Rate ($)", 85, "Coding / Behavioral / System Design"],
      ["Non-Standard Rate ($)", 115, "Other interview types"],
      ["Cancellation Rate ($)", 75, "No-show / late cancellation"],
      ["Tax Scalar", 0.7, "Applied to gross"],
      ["Count Upcoming Interviews", 1, "0 = past only, 1 = include upcoming"],
      ["", "", ""],
      ["Manual Inputs (resets monthly)", "", ""],
      ["# Non-Standard Interviews", 0, "Transforms $85 → $115"],
      ["# Late Cancellations", 0, "Manual entry — event removed from calendar"],
    ];

    for (var r = 0; r < layout.length; r++) {
      sheet.getRange(r + 1, 1, 1, 3).setValues([layout[r]]);
    }

    sheet.getRange("A1").setFontWeight("bold");
    sheet.getRange("A3").setFontWeight("bold");
    sheet.getRange("A7").setFontWeight("bold");
    sheet.getRange("A14").setFontWeight("bold");
    sheet.getRange("A17").setFontWeight("bold");
    sheet.getRange("A22").setFontWeight("bold");
    sheet.getRange("A29").setFontWeight("bold");

    sheet.getRange("B5").setNumberFormat("0");
    sheet.getRange("B4").setNumberFormat("@");
    sheet.getRange("B8:B15").setNumberFormat("#,##0");
    sheet.getRange("B18:B20").setNumberFormat("#,##0");
    sheet.getRange("B23:B25").setNumberFormat("0");
    sheet.getRange("B26").setNumberFormat("0.00");
    sheet.getRange("B27").setNumberFormat("0");
    sheet.getRange("B30:B31").setNumberFormat("0");

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

    // Reset manual inputs if month rolled over
    this.maybeResetManualInputs(sheet, month);

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

    // Read interview settings
    var settings = {
      standardRate: Number(sheet.getRange("B18").getValue()) || 85,
      nonStandardRate: Number(sheet.getRange("B19").getValue()) || 115,
      cancellationRate: Number(sheet.getRange("B20").getValue()) || 75,
      taxScalar: Number(sheet.getRange("B21").getValue()) || 0.7,
      countUpcoming: Number(sheet.getRange("B22").getValue()) !== 0,
      nonStandardCount: Number(sheet.getRange("B25").getValue()) || 0,
      cancellationCount: Number(sheet.getRange("B26").getValue()) || 0
    };

    var spend = this.calculateSpend(startStr, endStr);
    sheet.getRange("B8").setValue(spend);

    var interviewIncome = this.calculateInterviewIncome(startStr, endStr, settings);
    sheet.getRange("B9").setValue(interviewIncome);

    var manualAdjustments = this.calculateManualAdjustments(startStr, endStr);
    sheet.getRange("B10").setValue(manualAdjustments);

    // Recurring bills
    var recurring = RECURRING.calculateUpcoming(year, monthNum, today);
    var upcomingRecurring = recurring.upcoming;
    var includeRecurring = Number(sheet.getRange("B15").getValue()) !== 0;

    sheet.getRange("B14").setValue(upcomingRecurring);
    sheet.getRange("C14").setValue(recurring.items.map(function(i) {
      var label = i.merchant.charAt(0).toUpperCase() + i.merchant.slice(1);
      if (i.remaining > 1 && i.frequency === "weekly") {
        return label + " " + i.remaining + "x ($" + i.upcomingAmount + ")";
      }
      return label + " ($" + i.upcomingAmount + ")";
    }).join(", ") || "None");

    // Net income = 9000 + interviews + manual - spend - (recurring if enabled)
    var totalSpend = spend + (includeRecurring ? upcomingRecurring : 0);
    var netIncome = 9000 + interviewIncome + manualAdjustments - totalSpend;
    sheet.getRange("B11").setValue(netIncome);

    var dailyBudget = daysRemaining > 0 ? (netIncome - target) / daysRemaining : 0;
    sheet.getRange("B13").setValue(Math.round(dailyBudget));
    sheet.getRange("C13").setValue("Target: $" + target + ", " + daysRemaining + " days left");

    Debug.log("Dashboard.refresh", "Spend: $" + spend + " | Recurring: $" + upcomingRecurring + " | Net: $" + netIncome + " | Daily: $" + Math.round(dailyBudget));
  },

  /**
   * Reset manual inputs to 0 when the displayed month changes.
   * Also auto-snapshots the previous month's data before resetting.
   */
  maybeResetManualInputs: function (sheet, currentMonth) {
    var props = PropertiesService.getScriptProperties();
    var lastMonth = props.getProperty("LAST_DASHBOARD_MONTH");

    if (lastMonth && lastMonth === currentMonth) {
      return;
    }

    // Snapshot the month we're leaving, then reset inputs
    if (lastMonth) {
      SNAPSHOT.autoSnapshotOnRollover(lastMonth);
    }

    sheet.getRange("B25").setValue(0);
    sheet.getRange("B26").setValue(0);
    props.setProperty("LAST_DASHBOARD_MONTH", currentMonth);

    Debug.log("Dashboard.maybeResetManualInputs", "Month changed from " + lastMonth + " to " + currentMonth + " — reset manual inputs");
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

    // Resolve columns from the header row (order-independent)
    if (data.length < 1) return 0;
    var header = [];
    for (var h = 0; h < data[0].length; h++) header.push(String(data[0][h]));
    var dateCol = header.indexOf("date");
    var amountCol = header.indexOf("amount");
    var catCol = header.indexOf("category");
    if (dateCol < 0 || amountCol < 0) {
      Debug.error("Dashboard.calculateSpend", "transactions tab missing date/amount columns");
      return 0;
    }

    Debug.log("Dashboard.calculateSpend", "Data rows: " + (data.length - 1) + ", date range: " + startDate + " to " + endDate);
    var matchedDate = 0, matchedCategory = 0, matchedAmount = 0;
    for (var r = 1; r < data.length; r++) {
      var rawDate = data[r][dateCol];
      var amount = Number(data[r][amountCol]) || 0;
      var category = catCol >= 0 ? String(data[r][catCol] || "") : "";

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
   * Calculate interview income from the interview_income tab.
   * All calendar events are treated as standard ($85) by default.
   * Non-standard count transforms existing entries (+$30 each).
   * Cancellations are manual input ($75 each).
   * Settings are read from the dashboard cells.
   */
  calculateInterviewIncome: function (startDate, endDate, settings) {
    settings = settings || {};
    var standardRate = settings.standardRate || 85;
    var nonStandardRate = settings.nonStandardRate || 115;
    var cancellationRate = settings.cancellationRate || 75;
    var taxScalar = settings.taxScalar || 0.7;
    var countUpcoming = settings.countUpcoming !== false;
    var nonStandardCount = settings.nonStandardCount || 0;
    var cancellationCount = settings.cancellationCount || 0;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("interview_income");
    if (!sheet) return 0;

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;

    var header = [];
    for (var h = 0; h < data[0].length; h++) header.push(String(data[0][h]));
    var dateCol = header.indexOf("date");
    var statusCol = header.indexOf("status");
    if (dateCol < 0) {
      Debug.error("Dashboard.calculateInterviewIncome", "interview_income tab missing date column");
      return 0;
    }

    var totalInterviews = 0;
    for (var r = 1; r < data.length; r++) {
      var rawDate = data[r][dateCol];
      var date = "";
      if (rawDate instanceof Date) {
        date = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        date = String(rawDate || "");
      }
      if (date < startDate || date > endDate) continue;

      var status = statusCol >= 0 ? String(data[r][statusCol] || "") : "";
      if (!countUpcoming && status === "Upcoming") continue;

      totalInterviews++;
    }

    var cappedNonStandard = Math.min(nonStandardCount, totalInterviews);
    var standardCount = totalInterviews - cappedNonStandard;

    var gross = standardCount * standardRate + cappedNonStandard * nonStandardRate + cancellationCount * cancellationRate;
    var net = Math.round(gross * taxScalar * 100) / 100;

    Debug.log("Dashboard.calculateInterviewIncome",
      "Interviews: " + totalInterviews +
      ", standard: " + standardCount +
      ", non-standard: " + cappedNonStandard +
      ", cancellations: " + cancellationCount +
      ", countUpcoming: " + countUpcoming +
      ", gross: " + gross +
      ", net: " + net);

    return net;
  },

  /**
   * Calculate manual adjustments.
   * Reads columns by header name (date, amount).
   */
  calculateManualAdjustments: function (startDate, endDate) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("adjustments");
    if (!sheet) return 0;

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;

    var header = [];
    for (var h = 0; h < data[0].length; h++) header.push(String(data[0][h]));
    var dateCol = header.indexOf("date");
    var amountCol = header.indexOf("amount");
    if (dateCol < 0 || amountCol < 0) {
      Debug.error("Dashboard.calculateManualAdjustments", "adjustments tab missing date/amount columns");
      return 0;
    }

    var total = 0;
    for (var r = 1; r < data.length; r++) {
      var rawDate = data[r][dateCol];
      var date = "";
      if (rawDate instanceof Date) {
        date = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        date = String(rawDate || "");
      }
      var amount = Number(data[r][amountCol]) || 0;
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

/**
 * Auto-refresh dashboard when any input cell changes.
 * Runs automatically on every edit — no button needed.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  var tabName = sheet.getName();

  // Dashboard inputs: B4, B5, B15, B18:B22, B25:B26
  if (tabName === DASHBOARD.TAB) {
    var row = e.range.getRow();
    var col = e.range.getColumn();

    if (col !== 2) return;

    var inputRows = [4, 5, 15, 23, 24, 25, 26, 27, 30, 31];
    if (inputRows.indexOf(row) < 0) return;

    Debug.log("Dashboard.onEdit", "Input cell B" + row + " changed — auto-refreshing dashboard");
    DASHBOARD.refresh();
    return;
  }

  // Any edit in adjustments tab → refresh dashboard
  if (tabName === "adjustments") {
    Debug.log("Dashboard.onEdit", "Adjustments tab edited — auto-refreshing dashboard");
    DASHBOARD.refresh();
    return;
  }

  // Any edit in recurring tab → refresh dashboard
  if (tabName === "recurring") {
    Debug.log("Dashboard.onEdit", "Recurring tab edited — auto-refreshing dashboard");
    DASHBOARD.refresh();
    return;
  }
}
