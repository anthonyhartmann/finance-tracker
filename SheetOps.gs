/**
 * SheetOps.gs — Google Sheet operations: writing data to tabs
 */

const SHEET = {
  /**
   * Ensure a tab exists with the given headers.
   * Creates it if missing, clears if requested.
   */
  ensureTab: function (tabName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      Debug.log("SheetOps.ensureTab", "Created tab: " + tabName);
    }
    return sheet;
  },

  /**
   * Append a row of data to a tab.
   */
  appendRow: function (tabName, row) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      Debug.error("SheetOps.appendRow", "Tab not found: " + tabName);
      return;
    }
    sheet.appendRow(row);
  },

  /**
   * Write transactions to the transactions tab (dedup by transaction_id).
   */
  writeTransactions: function (transactions) {
    const tabName = "transactions";
    const headers = [
      "transaction_id", "account_id", "date", "name", "merchant_name",
      "amount", "category", "payment_channel", "pending", "currency", "synced_at"
    ];
    
    const sheet = this.ensureTab(tabName, headers);
    
    // Get existing IDs for dedup
    var existingData = sheet.getDataRange().getValues();
    var existingIds = {};
    for (var r = 1; r < existingData.length; r++) {
      if (existingData[r][0]) {
        existingIds[String(existingData[r][0])] = true;
      }
    }
    
    var added = 0;
    var skipped = 0;
    var now = new Date().toISOString();
    
    for (var i = 0; i < transactions.length; i++) {
      var t = transactions[i];
      if (existingIds[t.transaction_id]) {
        skipped++;
        continue;
      }
      
      sheet.appendRow([
        t.transaction_id,
        t.account_id,
        t.authorized_date || t.date,
        t.name,
        t.merchant_name || "",
        t.amount,
        t.personal_finance_category ? t.personal_finance_category.primary : "",
        t.payment_channel || "",
        t.pending ? "TRUE" : "FALSE",
        t.iso_currency_code || "USD",
        now,
      ]);
      added++;
    }
    
    Debug.log("SheetOps.writeTransactions", "Added: " + added + ", Skipped (dupes): " + skipped);
  },

  /**
   * Write balances to the dashboard tab.
   */
  writeBalances: function (balances) {
    const tabName = "dashboard";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      Debug.log("SheetOps.writeBalances", "Dashboard tab not found, skipping balance write");
      return;
    }
    
    // Calculate total available balance (negate credit cards)
    var total = 0;
    for (var i = 0; i < balances.length; i++) {
      var b = balances[i];
      var bal = b.available !== null ? b.available : b.current;
      // Credit card balances are positive (amount you owe) — negate them
      if (b.type === "credit") {
        total -= bal;
      } else {
        total += bal;
      }
    }
    
    // Write to a specific cell in the dashboard
    var balanceCell = sheet.getRange("B1");
    balanceCell.setValue(total);
    Debug.log("SheetOps.writeBalances", "Total available balance: " + total);
  }
};
