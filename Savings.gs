/**
 * Savings.gs — Completely isolated savings tracker.
 *
 * Uses Plaid /transactions/get (not sync) to backfill arbitrary date ranges.
 * Also calls /investments/transactions/get for 401k contribution data.
 *
 * Detects per month:
 *   + Transfers from checking → savings (EXCLUDES P2P, ATM withdrawals)
 *   + 401k contributions (Fidelity /investments/transactions/get, subtype=contribution)
 *   − Ally outflows
 *
 * Tab: savings_tracker
 * Columns: month, transfers_to_savings, retirement_401k, ally_outflows, net_savings, details
 */

const SAVINGS = {
  TAB: "savings_tracker",
  HEADERS: ["month", "transfers_to_savings", "retirement_401k", "ally_outflows", "net_savings", "details"],

  EXCLUDE_KEYWORDS: ["venmo", "zelle", "cash app", "paypal", "cashapp", "atm", "withdrawal", "withdrwl"],

  backfill: function (startDate, endDate) {
    startDate = startDate || "2026-01-01";
    endDate = endDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    Debug.log("Savings.backfill", "Range: " + startDate + " to " + endDate);

    var allTx = this.fetchAllTransactions(startDate, endDate);
    var allInvTx = this.fetchAllInvestmentTransactions(startDate, endDate);
    Debug.log("Savings.backfill", "Fetched " + allTx.length + " bank transactions, " + allInvTx.length + " investment transactions");

    var byMonth = {};

    // Process bank transactions
    for (var i = 0; i < allTx.length; i++) {
      var t = allTx[i];
      var date = t.date || t.authorized_date || "";
      if (!date || date < startDate || date > endDate) continue;

      var month = date.substring(0, 7);
      if (!byMonth[month]) {
        byMonth[month] = { transfers: 0, retirement: 0, ally_out: 0, details: [] };
      }

      var accountName = String(t._account_name || "").toLowerCase();
      var accountSubtype = String(t._account_subtype || "").toLowerCase();
      var category = this.getCategory(t);
      var merchant = String(t.merchant_name || "").toLowerCase();
      var name = String(t.name || "").toLowerCase();
      var amount = Number(t.amount) || 0;

      // Transfers FROM checking → savings
      var isTransfer = category.indexOf("TRANSFER") >= 0;
      var isChecking = accountSubtype === "checking" || accountName.indexOf("checking") >= 0;
      var isExcluded = this.isExcluded(name + " " + merchant);

      if (isTransfer && isChecking && amount > 0 && !isExcluded) {
        byMonth[month].transfers += amount;
        byMonth[month].details.push(date + ": Transfer to savings $" + amount + " (" + name + ")");
        continue;
      }

      // Ally outflows
      var isAlly = accountName.indexOf("ally") >= 0;
      if (isAlly && amount > 0) {
        byMonth[month].ally_out += amount;
        byMonth[month].details.push(date + ": Ally outflow $" + amount + " (" + name + ")");
      }
    }

    // Process investment transactions (401k contributions)
    for (var j = 0; j < allInvTx.length; j++) {
      var inv = allInvTx[j];
      var invDate = inv.date || "";
      if (!invDate || invDate < startDate || invDate > endDate) continue;

      var invMonth = invDate.substring(0, 7);
      if (!byMonth[invMonth]) {
        byMonth[invMonth] = { transfers: 0, retirement: 0, ally_out: 0, details: [] };
      }

      var subtype = String(inv.subtype || "").toLowerCase();
      var invAmount = Number(inv.amount) || 0;
      var invName = String(inv.name || "");

      // Contributions are negative in Plaid's investment API (money going IN)
      if (subtype === "contribution" && invAmount < 0) {
        var contribAmount = Math.abs(invAmount);
        byMonth[invMonth].retirement += contribAmount;
        byMonth[invMonth].details.push(invDate + ": 401k contrib $" + contribAmount + " (" + invName + ")");
      }
    }

    // Write to tab
    var sheet = this.ensureTab();
    var rows = [];
    var months = Object.keys(byMonth).sort();
    for (var m = 0; m < months.length; m++) {
      var mm = months[m];
      var d = byMonth[mm];
      var net = Math.round((d.transfers + d.retirement - d.ally_out) * 100) / 100;
      var detailText = d.details.join("; ");
      rows.push([mm, d.transfers, d.retirement, d.ally_out, net, detailText]);
    }

    sheet.clearContents();
    sheet.getRange(1, 1, 1, this.HEADERS.length).setValues([this.HEADERS]);
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, this.HEADERS.length).setValues(rows);
    }
    sheet.setFrozenRows(1);

    Debug.log("Savings.backfill", "Wrote " + rows.length + " month(s)");
    Debug.log("Savings.backfill", "Transfers total: " + Object.keys(byMonth).map(function(m) { return byMonth[m].transfers; }).reduce(function(a,b){return a+b;}, 0));
    Debug.log("Savings.backfill", "Retirement total: " + Object.keys(byMonth).map(function(m) { return byMonth[m].retirement; }).reduce(function(a,b){return a+b;}, 0));
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

  /**
   * Fetch bank transactions for ALL linked items via /transactions/get.
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

        Debug.log("Savings.fetchAllTransactions", itemName + ": done, total so far " + all.length);
      } catch (e) {
        Debug.error("Savings.fetchAllTransactions", itemName + " failed: " + e.message);
      }
    }

    return all;
  },

  /**
   * Fetch investment transactions for ALL linked items via /investments/transactions/get.
   */
  fetchAllInvestmentTransactions: function (startDate, endDate) {
    var props = PropertiesService.getScriptProperties();
    var keys = props.getKeys();
    var all = [];

    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("ACCESS_TOKEN_") !== 0) continue;
      var itemName = keys[i].replace("ACCESS_TOKEN_", "");
      var token = props.getProperty(keys[i]);
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
          for (var t = 0; t < txList.length; t++) {
            all.push(txList[t]);
          }

          hasMore = txList.length === 100;
          page++;
        }

        Debug.log("Savings.fetchAllInvestmentTransactions", itemName + ": done, total so far " + all.length);
      } catch (e) {
        // Product not enabled for this item — skip silently
        if (e.message && e.message.indexOf("PRODUCT_NOT_ENABLED") >= 0) {
          Debug.log("Savings.fetchAllInvestmentTransactions", itemName + ": investments product not enabled, skipping");
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
 * Diagnostic: try /investments/transactions/get on Fidelity.
 */
function testFidelityInvestments() {
  var token = PLAID.getAccessToken("fidelity");
  if (!token) {
    Debug.error("testFidelityInvestments", "No fidelity access_token found");
    return;
  }

  try {
    var data = PLAID._post("/investments/transactions/get", {
      access_token: token,
      start_date: "2026-01-01",
      end_date: "2026-07-25",
      options: { count: 100 }
    });
    Debug.logRaw("testFidelityInvestments", data);
    Debug.log("testFidelityInvestments", "Investment transactions found: " + (data.investment_transactions || []).length);
  } catch (e) {
    Debug.error("testFidelityInvestments", "Failed: " + e.message);
  }
}
