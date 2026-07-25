/**
 * Sync.gs — Day-to-day sync operations for linked production accounts.
 *
 * History window is controlled by PLAID.SYNC_START_DATE (Plaid.gs).
 * Incremental updates also arrive automatically via the Plaid webhook (Webhook.gs).
 */

/**
 * Sync a single production account by item name (prompts if not given).
 */
function syncProductionAccount(itemName) {
  if (!itemName) {
    itemName = SpreadsheetApp.getUi().prompt("Item Name:", SpreadsheetApp.getUi().ButtonSet.OK_CANCEL).getResponseText().trim();
  }

  Debug.log("syncProductionAccount", "Syncing: " + itemName);

  var result = PLAID.syncTransactions(itemName);
  SHEET.writeTransactions(result);

  var balances = PLAID.fetchBalances(itemName);
  SHEET.writeBalances(balances);

  Debug.log("syncProductionAccount", "[OK] " + itemName + " synced: " + result.added.length + " new, " + result.modified.length + " updated, " + result.removed.length + " removed.");
}

/**
 * Sync ALL linked production accounts and refresh dashboard.
 * Applies added/updated/removed per account; writes ONE aggregate balance.
 */
function syncAllProductionAccounts() {
  Debug.log("syncAllProductionAccounts", "Syncing all linked accounts...");

  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys();
  var synced = 0;
  var allBalances = [];

  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf("ACCESS_TOKEN_") === 0) {
      var itemName = keys[i].replace("ACCESS_TOKEN_", "");
      Debug.log("syncAllProductionAccounts", "Syncing: " + itemName);

      try {
        var result = PLAID.syncTransactions(itemName);
        SHEET.writeTransactions(result);

        var balances = PLAID.fetchBalances(itemName);
        allBalances = allBalances.concat(balances);

        Debug.log("syncAllProductionAccounts", itemName + " done: " + result.added.length + " new, " + result.modified.length + " updated, " + result.removed.length + " removed");
        synced++;
      } catch (e) {
        Debug.error("syncAllProductionAccounts", itemName + " failed: " + e.message);
      }
    }
  }

  // Write ONE aggregate balance across all accounts
  if (allBalances.length > 0) {
    SHEET.writeBalances(allBalances);
  }

  // Refresh dashboard
  DASHBOARD.refresh();

  Debug.log("syncAllProductionAccounts", "[OK] " + synced + " accounts synced. Dashboard refreshed.");
}

/**
 * FULL REBUILD (safe to re-run): deletes the transactions tab, clears all sync
 * cursors, removes sandbox (platypus) tokens, then re-syncs every linked bank.
 * History before PLAID.SYNC_START_DATE is walked but never written.
 */
function resetAndResync() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    "Reset & Resync",
    "This will:\n• DELETE the transactions tab (recreated fresh)\n• Clear all sync cursors\n• Remove sandbox (platypus) tokens\n• Re-sync all linked banks, keeping transactions from " + PLAID.SYNC_START_DATE + " onward\n\nContinue?",
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) {
    Debug.log("resetAndResync", "Cancelled by user.");
    return;
  }

  Debug.log("resetAndResync", "=== Starting reset & resync ===");

  // 1. Delete transactions tab (writeTransactions recreates it with headers)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName("transactions");
  if (tab) {
    ss.deleteSheet(tab);
    Debug.log("resetAndResync", "Deleted transactions tab.");
  }

  // 2. Clear ALL cursors + sandbox tokens
  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys();
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf("CURSOR_") === 0) {
      props.deleteProperty(k);
      Debug.log("resetAndResync", "Cleared cursor: " + k);
    } else if (k.indexOf("ACCESS_TOKEN_platypus") === 0) {
      props.deleteProperty(k);
      Debug.log("resetAndResync", "Removed sandbox token: " + k);
    }
  }

  // 3. Full re-sync (date filter applies inside PLAID.syncTransactions)
  syncAllProductionAccounts();

  Debug.log("resetAndResync", "=== Reset & resync complete. Future updates arrive via webhook. ===");
}
