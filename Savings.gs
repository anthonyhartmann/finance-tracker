/**
 * Savings.gs — Completely isolated savings tracker.
 *
 * Uses Plaid /transactions/get (not sync) to backfill arbitrary date ranges
 * without touching the main tracker's cursors.
 *
 * Detects per month:
 *   + Transfers from checking accounts → savings (Ally, Pershing, etc.)
 *   + 401k contributions (Fidelity NetBenefits)
 *   − Any outflow from Ally (taxes, big withdrawals)
 *
 * Tab: savings_tracker
 * Columns: month, transfers_to_savings, retirement_401k, ally_outflows, net_savings
 */

const SAVINGS = {
  TAB: "savings_tracker",
  HEADERS: ["month", "transfers_to_savings", "retirement_401k", "ally_outflows", "net_savings"],

  /**
   * Backfill savings data for a date range.
   * @param {string} startDate  YYYY-MM-DD
   * @param {string} endDate    YYYY-MM-DD
   */
  backfill: function (startDate, endDate) {
    startDate = startDate || "2026-01-01";
    endDate = endDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    Debug.log("Savings.backfill", "Range: " + startDate + " to " + endDate);

    var allTx = this.fetchAllTransactions(startDate, endDate);
    Debug.log("Savings.backfill", "Fetched " + allTx.length + " total transactions");

    var byMonth = {};
    var debugMatches = { transfers: [], retirement: [], ally: [] };

    for (var i = 0; i < allTx.length; i++) {
      var t = allTx[i];
      var date = t.date || t.authorized_date || "";
      if (!date || date < startDate || date > endDate) continue;

      var month = date.substring(0, 7); // YYYY-MM
      if (!byMonth[month]) {
        byMonth[month] = { transfers: 0, retirement: 0, ally_out: 0 };
      }

      var accountName = String(t._account_name || "").toLowerCase();
      var accountSubtype = String(t._account_subtype || "").toLowerCase();
      var category = this.getCategory(t);
      var merchant = String(t.merchant_name || "").toLowerCase();
      var name = String(t.name || "").toLowerCase();
      var amount = Number(t.amount) || 0;

      // 1) Transfers FROM checking accounts → savings
      //    Plaid categories: TRANSFER_OUT, TRANSFER_IN, TRANSFER
      var isTransfer = category.indexOf("TRANSFER") >= 0;
      var isChecking = accountSubtype === "checking" || accountName.indexOf("checking") >= 0;
      if (isTransfer && isChecking && amount > 0) {
        byMonth[month].transfers += amount;
        debugMatches.transfers.push(date + " | " + accountName + " | " + name + " | $" + amount);
        continue;
      }

      // 2) 401k contributions — Fidelity / NetBenefits / retirement keywords
      var isRetirement = (
        accountName.indexOf("401k") >= 0 ||
        accountName.indexOf("fidelity") >= 0 ||
        merchant.indexOf("netbenefits") >= 0 ||
        merchant.indexOf("fidelity") >= 0 ||
        name.indexOf("netbenefits") >= 0 ||
        name.indexOf("401k") >= 0 ||
        name.indexOf("retirement") >= 0
      );
      if (isRetirement && amount > 0) {
        byMonth[month].retirement += amount;
        debugMatches.retirement.push(date + " | " + accountName + " | " + name + " | $" + amount);
        continue;
      }

      // 3) Ally outflows — ANY positive amount from Ally (money leaving)
      var isAlly = accountName.indexOf("ally") >= 0;
      if (isAlly && amount > 0) {
        byMonth[month].ally_out += amount;
        debugMatches.ally.push(date + " | " + accountName + " | " + name + " | $" + amount);
      }
    }

    // Debug: log matched transactions
    Debug.log("Savings.backfill", "Transfers matched: " + debugMatches.transfers.length);
    for (var d = 0; d < Math.min(debugMatches.transfers.length, 10); d++) {
      Debug.log("Savings.backfill", "[TRANSFER] " + debugMatches.transfers[d]);
    }
    Debug.log("Savings.backfill", "Retirement matched: " + debugMatches.retirement.length);
    for (var d2 = 0; d2 < Math.min(debugMatches.retirement.length, 10); d2++) {
      Debug.log("Savings.backfill", "[RETIREMENT] " + debugMatches.retirement[d2]);
    }
    Debug.log("Savings.backfill", "Ally outflows matched: " + debugMatches.ally.length);
    for (var d3 = 0; d3 < Math.min(debugMatches.ally.length, 10); d3++) {
      Debug.log("Savings.backfill", "[ALLY] " + debugMatches.ally[d3]);
    }

    // Write to savings_tracker tab
    var sheet = this.ensureTab();
    var rows = [];
    var months = Object.keys(byMonth).sort();
    for (var m = 0; m < months.length; m++) {
      var mm = months[m];
      var d = byMonth[mm];
      var net = Math.round((d.transfers + d.retirement - d.ally_out) * 100) / 100;
      rows.push([mm, d.transfers, d.retirement, d.ally_out, net]);
    }

    sheet.clearContents();
    sheet.getRange(1, 1, 1, this.HEADERS.length).setValues([this.HEADERS]);
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, this.HEADERS.length).setValues(rows);
    }
    sheet.setFrozenRows(1);

    Debug.log("Savings.backfill", "Wrote " + rows.length + " month(s) to " + this.TAB);
  },

  /**
   * Get normalized category string from a Plaid transaction.
   */
  getCategory: function (t) {
    if (typeof t.category === "string") return t.category.toUpperCase();
    if (t.personal_finance_category && typeof t.personal_finance_category.primary === "string") {
      return t.personal_finance_category.primary.toUpperCase();
    }
    return "";
  },

  /**
   * Fetch transactions for ALL linked items via /transactions/get.
   */
  fetchAllTransactions: function (startDate, endDate) {
    var props = PropertiesService.getScriptProperties();
    var keys = props.getKeys();
    var all = [];

    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("ACCESS_TOKEN_") !== 0) continue;
      var itemName = keys[i].replace("ACCESS_TOKEN_", "");
      var token = props.getProperty(keys[i]);
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

        Debug.log("Savings.fetchAllTransactions", itemName + ": fetched " + all.length + " so far");
      } catch (e) {
        Debug.error("Savings.fetchAllTransactions", itemName + " failed: " + e.message);
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
