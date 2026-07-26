/**
 * Savings.gs — Completely isolated savings tracker.
 *
 * Uses Plaid /transactions/get (not sync) and /investments/transactions/get
 * to backfill arbitrary date ranges without touching main tracker cursors.
 *
 * Tab: savings_tracker
 * Columns: month, net_savings(formula), transfers_auto, retirement_auto, ally_auto,
 *          manual_transfers, manual_retirement, manual_ally_out, details
 */

const SAVINGS = {
  TAB: "savings_tracker",
  HEADERS: [
    "month", "net_savings", "transfers_auto", "retirement_auto",
    "ally_auto", "manual_transfers", "manual_retirement", "manual_ally_out", "details"
  ],

  // Bank items to query for savings tracker (skip discover, chase)
  BANK_ITEMS: ["ally", "bofa", "fidelity"],

  EXCLUDE_KEYWORDS: ["venmo", "zelle", "cash app", "paypal", "cashapp", "atm", "withdrawal", "withdrwl"],

  backfill: function (startDate, endDate) {
    startDate = startDate || "2026-01-01";
    endDate = endDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    Debug.log("Savings.backfill", "Range: " + startDate + " to " + endDate);

    var allTx = this.fetchAllTransactions(startDate, endDate);
    var allInvTx = this.fetchAllInvestmentTransactions(startDate, endDate);
    Debug.log("Savings.backfill", "Fetched " + allTx.length + " bank tx, " + allInvTx.length + " investment tx");

    var byMonth = {};

    // Bank transactions
    for (var i = 0; i < allTx.length; i++) {
      var t = allTx[i];
      var date = t.date || t.authorized_date || "";
      if (!date || date < startDate || date > endDate) continue;
      var month = date.substring(0, 7);
      if (!byMonth[month]) byMonth[month] = { transfers: 0, retirement: 0, ally: 0, details: [] };

      var accountName = String(t._account_name || "").toLowerCase();
      var accountSubtype = String(t._account_subtype || "").toLowerCase();
      var category = this.getCategory(t);
      var merchant = String(t.merchant_name || "").toLowerCase();
      var name = String(t.name || "").toLowerCase();
      var amount = Number(t.amount) || 0;

      var isTransfer = category.indexOf("TRANSFER") >= 0;
      var isChecking = accountSubtype === "checking" || accountName.indexOf("checking") >= 0;
      var isExcluded = this.isExcluded(name + " " + merchant);

      if (isTransfer && isChecking && amount > 0 && !isExcluded) {
        byMonth[month].transfers += amount;
        byMonth[month].details.push(date + ": Transfer to savings $" + amount + " (" + name + ")");
        continue;
      }

      if (accountName.indexOf("ally") >= 0 && amount > 0) {
        byMonth[month].ally += amount;
        byMonth[month].details.push(date + ": Ally outflow $" + amount + " (" + name + ")");
      }
    }

    // Investment transactions (401k contributions)
    for (var j = 0; j < allInvTx.length; j++) {
      var inv = allInvTx[j];
      var invDate = inv.date || "";
      if (!invDate || invDate < startDate || invDate > endDate) continue;
      var invMonth = invDate.substring(0, 7);
      if (!byMonth[invMonth]) byMonth[invMonth] = { transfers: 0, retirement: 0, ally: 0, details: [] };

      var subtype = String(inv.subtype || "").toLowerCase();
      var invAmount = Number(inv.amount) || 0;
      var invName = String(inv.name || "");

      if (subtype === "contribution" && invAmount < 0) {
        var contrib = Math.abs(invAmount);
        byMonth[invMonth].retirement += contrib;
        byMonth[invMonth].details.push(invDate + ": 401k contrib $" + contrib + " (" + invName + ")");
      }
    }

    // Write to sheet
    var sheet = this.ensureTab();
    var months = Object.keys(byMonth).sort();
    var rows = [];
    for (var m = 0; m < months.length; m++) {
      var mm = months[m];
      var d = byMonth[mm];
      var detailText = d.details.join("\n");
      // net_savings formula: auto_transfers + auto_retirement - auto_ally + manual_transfers + manual_retirement - manual_ally_out
      var formula = '=C' + (m + 2) + '+D' + (m + 2) + '-E' + (m + 2) + '+F' + (m + 2) + '+G' + (m + 2) + '-H' + (m + 2);
      rows.push([mm, formula, d.transfers, d.retirement, d.ally, 0, 0, 0, detailText]);
    }

    sheet.clearContents();
    sheet.getRange(1, 1, 1, this.HEADERS.length).setValues([this.HEADERS]);
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, this.HEADERS.length).setValues(rows);
    }
    sheet.setFrozenRows(1);

    // Format: wrap text on details column, fixed width
    var detailsCol = this.HEADERS.length; // last column
    var detailRange = sheet.getRange(1, detailsCol, rows.length + 1, 1);
    detailRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    sheet.setColumnWidth(detailsCol, 300);

    // Format: wrap on month column too
    sheet.getRange(1, 1, rows.length + 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);

    Debug.log("Savings.backfill", "Wrote " + rows.length + " month(s)");
  },

  isExcluded: function (text) {
    text = text.toLowerCase();
    for (var i = 0; i < this.EXCLUDE_KEYWORDS.length; i++) {
      if (text.indexOf(this.EXCLUDE_KEYWORDS[i]) >= 0) return true;
    }
    return false;
  },

  getCategory: function (t) {
    if (typeof t.category === "string") return t.category.toUpperCase();
    if (t.personal_finance_category && typeof t.personal_finance_category.primary === "string") {
      return t.personal_finance_category.primary.toUpperCase();
    }
    return "";
  },

  fetchAllTransactions: function (startDate, endDate) {
    var props = PropertiesService.getScriptProperties();
    var all = [];

    for (var i = 0; i < this.BANK_ITEMS.length; i++) {
      var itemName = this.BANK_ITEMS[i];
      var token = props.getProperty("ACCESS_TOKEN_" + itemName);
      if (!token) continue;

      try {
        var accounts = PLAID.getAccounts(itemName);
        var accountMap = {};
        var subtypeMap = {};
        for (var a = 0; a < accounts.length; a++) {
          accountMap[accounts[a].account_id] = accounts[a].name;
          subtypeMap[accounts[a].account_id] = accounts[a].subtype || "";
        }

        var page = 0;
        var hasMore = true;
        while (hasMore) {
          var data = PLAID._post("/transactions/get", {
            access_token: token,
            start_date: startDate,
            end_date: endDate,
            options: { offset: page * 500, count: 500 }
          });
          var txList = data.transactions || [];
          for (var t = 0; t < txList.length; t++) {
            txList[t]._account_name = accountMap[txList[t].account_id] || "";
            txList[t]._account_subtype = subtypeMap[txList[t].account_id] || "";
            all.push(txList[t]);
          }
          hasMore = txList.length === 500;
          page++;
        }
        Debug.log("Savings.fetchAllTransactions", itemName + ": done, total " + all.length);
      } catch (e) {
        Debug.error("Savings.fetchAllTransactions", itemName + " failed: " + e.message);
      }
    }
    return all;
  },

  fetchAllInvestmentTransactions: function (startDate, endDate) {
    var props = PropertiesService.getScriptProperties();
    var all = [];

    for (var i = 0; i < this.BANK_ITEMS.length; i++) {
      var itemName = this.BANK_ITEMS[i];
      var token = props.getProperty("ACCESS_TOKEN_" + itemName);
      if (!token) continue;

      try {
        var page = 0;
        var hasMore = true;
        while (hasMore) {
          var data = PLAID._post("/investments/transactions/get", {
            access_token: token,
            start_date: startDate,
            end_date: endDate,
            options: { offset: page * 100, count: 100 }
          });
          var txList = data.investment_transactions || [];
          for (var t = 0; t < txList.length; t++) all.push(txList[t]);
          hasMore = txList.length === 100;
          page++;
        }
        Debug.log("Savings.fetchAllInvestmentTransactions", itemName + ": done, total " + all.length);
      } catch (e) {
        if (e.message && e.message.indexOf("PRODUCT_NOT_ENABLED") >= 0) {
          Debug.log("Savings.fetchAllInvestmentTransactions", itemName + ": investments not enabled, skipping");
        } else {
          Debug.error("Savings.fetchAllInvestmentTransactions", itemName + " failed: " + e.message);
        }
      }
    }
    return all;
  },

  ensureTab: function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(this.TAB);
    if (!sheet) {
      sheet = ss.insertSheet(this.TAB);
      sheet.appendRow(this.HEADERS);
      sheet.setFrozenRows(1);
      Debug.log("Savings.ensureTab", "Created tab: " + this.TAB);
    }
    return sheet;
  }
};

function backfillSavings() {
  SAVINGS.backfill("2026-01-01");
}

function backfillSavingsYear() {
  SAVINGS.backfill("2025-07-01");
}

/**
 * One-off: populate manual historical adjustments.
 * Run AFTER backfillSavingsYear().
 */
function populateManualAdjustments() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAVINGS.TAB);
  if (!sheet) {
    Debug.error("populateManualAdjustments", "savings_tracker tab not found");
    return;
  }

  var data = sheet.getDataRange().getValues();
  var monthCol = 0;  // column A
  var manualTransferCol = 5; // column F
  var manualRetirementCol = 6; // column G
  var manualAllyCol = 7; // column H

  // Map: month -> {manual_transfers, manual_retirement, manual_ally_out}
  var manual = {
    "2025-08": { transfers: 4000 + 2000 + 2000, retirement: 0, ally: 0 },
    "2025-10": { transfers: 3400 + 3000, retirement: 0, ally: 0 },
    "2025-11": { transfers: 1106.37, retirement: 0, ally: 0 }, // 29k - 27,893.63
    "2026-01": { transfers: 8000, retirement: 0, ally: 0 },
    "2026-02": { transfers: 3000, retirement: 0, ally: 0 },
    "2026-03": { transfers: 3000, retirement: 0, ally: 3533 }, // 770 + 2520 + 243
    "2026-06": { transfers: 6000, retirement: 0, ally: 0 }
  };

  for (var row = 1; row < data.length; row++) {
    var month = data[row][monthCol];
    if (manual[month]) {
      sheet.getRange(row + 1, manualTransferCol + 1).setValue(manual[month].transfers);
      sheet.getRange(row + 1, manualRetirementCol + 1).setValue(manual[month].retirement);
      sheet.getRange(row + 1, manualAllyCol + 1).setValue(manual[month].ally);
      Debug.log("populateManualAdjustments", "Set manual values for " + month);
    }
  }

  Debug.log("populateManualAdjustments", "Done. Review savings_tracker tab.");
}
