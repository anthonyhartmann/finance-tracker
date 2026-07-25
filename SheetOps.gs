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
   * Apply a sync result to the transactions tab.
   * Accepts { added, modified, removed } from PLAID.syncTransactions,
   * or a plain array (legacy — treated as additions).
   *   added:    appended, deduped by transaction_id
   *   modified: row with matching transaction_id is overwritten
   *   removed:  row with matching transaction_id is deleted
   * Rewrites the tab in one batch (fast, and keeps pending→posted correct).
   */
  writeTransactions: function (syncResult) {
    const tabName = "transactions";
    // Column order is fixed by this array. Existing tabs in an older layout
    // are migrated automatically below (rows are read by header NAME).
    const headers = [
      "account_name", "date", "merchant_name", "amount",
      "transaction_id", "account_id", "name", "category",
      "payment_channel", "pending", "currency", "synced_at"
    ];

    const sheet = this.ensureTab(tabName, headers);

    // Normalize input
    var added = [], modified = [], removed = [];
    if (Object.prototype.toString.call(syncResult) === "[object Array]") {
      added = syncResult;
    } else if (syncResult) {
      added = syncResult.added || [];
      modified = syncResult.modified || [];
      removed = syncResult.removed || [];
    }

    // Load existing rows as OBJECTS keyed by their current header names,
    // indexed by transaction_id (preserving order). Migrates old layouts.
    var data = sheet.getDataRange().getValues();
    var byId = {};
    var order = [];
    if (data.length > 1) {
      var oldHeader = [];
      for (var h = 0; h < data[0].length; h++) oldHeader.push(String(data[0][h]));
      var idCol = oldHeader.indexOf("transaction_id");
      if (idCol < 0) idCol = 0;
      for (var r = 1; r < data.length; r++) {
        var id = String(data[r][idCol] || "");
        if (!id) continue;
        var obj = {};
        for (var c = 0; c < oldHeader.length; c++) {
          if (oldHeader[c]) obj[oldHeader[c]] = data[r][c];
        }
        byId[id] = obj;
        order.push(id);
      }
    }

    // Resolve account names for anything missing one
    var needIds = [];
    function collect(id) { if (id && needIds.indexOf(id) < 0) needIds.push(String(id)); }
    var n;
    for (n = 0; n < added.length; n++) collect(added[n].account_id);
    for (n = 0; n < modified.length; n++) collect(modified[n].account_id);
    for (var oid in byId) {
      if (!byId[oid].account_name) collect(byId[oid].account_id);
    }
    var acctNames = needIds.length > 0 ? PLAID.getAccountNames(needIds) : {};

    var now = new Date().toISOString();
    function toRow(t) {
      return [
        t.account_name || acctNames[String(t.account_id)] || "",
        t.authorized_date || t.date || "",
        t.merchant_name || "",
        t.amount,
        t.transaction_id,
        t.account_id,
        t.name || "",
        (typeof t.category === "string") ? t.category : (t.personal_finance_category ? t.personal_finance_category.primary : ""),
        t.payment_channel || "",
        (t.pending === true || t.pending === "TRUE") ? "TRUE" : "FALSE",
        t.currency || t.iso_currency_code || "USD",
        t.synced_at || now,
      ];
    }

    var addedCount = 0, updatedCount = 0, removedCount = 0, dupeCount = 0;

    for (var x = 0; x < removed.length; x++) {
      var rid = String(removed[x].transaction_id);
      if (byId[rid]) {
        delete byId[rid];
        removedCount++;
      }
    }
    for (var m = 0; m < modified.length; m++) {
      var mt = modified[m];
      var mid = String(mt.transaction_id);
      if (byId[mid]) {
        byId[mid] = mt;
        updatedCount++;
      } else {
        byId[mid] = mt;
        order.push(mid);
        addedCount++;
      }
    }
    for (var a = 0; a < added.length; a++) {
      var at = added[a];
      var aid = String(at.transaction_id);
      if (byId[aid]) {
        dupeCount++;
        continue;
      }
      byId[aid] = at;
      order.push(aid);
      addedCount++;
    }

    // Rewrite tab in one batch (every entry passes through toRow → new column order)
    var out = [];
    for (var k = 0; k < order.length; k++) {
      if (byId[order[k]]) out.push(toRow(byId[order[k]]));
    }
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (out.length > 0) {
      sheet.getRange(2, 1, out.length, headers.length).setValues(out);
    }
    sheet.setFrozenRows(1);

    Debug.log("SheetOps.writeTransactions", "Added: " + addedCount + ", Updated: " + updatedCount + ", Removed: " + removedCount + ", Dupes skipped: " + dupeCount + ", Total rows: " + out.length);
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
