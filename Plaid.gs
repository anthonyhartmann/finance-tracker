/**
 * Plaid.gs — Plaid API integration: tokens, sync, balances
 * 
 * All functions log to the Debug tab for visibility.
 * Credentials stored in ScriptProperties by setupPlaidConfig().
 */

const PLAID = {
  /**
   * Earliest transaction date to keep (YYYY-MM-DD). Older history is still
   * walked (to advance the sync cursor to the present) but never written
   * to the Sheet. Change this to widen/narrow the history window.
   */
  SYNC_START_DATE: "2026-07-01",

  /**
   * Get the base URL for the current environment.
   */
  _baseUrl: function () {
    var env = PropertiesService.getScriptProperties().getProperty("PLAID_ENVIRONMENT") || "sandbox";
    if (env === "production") {
      return "https://production.plaid.com";
    }
    return "https://sandbox.plaid.com";
  },
  
  /**
   * Get credentials from ScriptProperties.
   */
  _creds: function () {
    const props = PropertiesService.getScriptProperties();
    return {
      client_id: props.getProperty("PLAID_CLIENT_ID"),
      secret: props.getProperty("PLAID_SECRET"),
    };
  },

  /**
   * Make a POST request to the Plaid API.
   */
  _post: function (endpoint, payload) {
    const creds = this._creds();
    const body = Object.assign({}, payload, {
      client_id: creds.client_id,
      secret: creds.secret,
    });
    
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    };
    
    const url = this._baseUrl() + endpoint;
    Debug.log("Plaid._post", "POST " + url);
    
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const data = JSON.parse(response.getContentText());
    
    Debug.log("Plaid._post", "Response: " + code);
    
    if (data.error_type) {
      Debug.log("Plaid._post", "ERROR: " + data.error_type + " - " + (data.error_message || "no message"));
      throw new Error(data.error_type + ": " + data.error_message);
    }
    
    return data;
  },
  
  /**
   * Create a sandbox-only public_token (bypasses Plaid Link entirely).
   * Sandbox only — production uses the browser Link flow.
   */
  sandboxCreatePublicToken: function () {
    Debug.log("Plaid.sandboxCreatePublicToken", "Creating sandbox public token...");
    
    const data = this._post("/sandbox/public_token/create", {
      institution_id: "ins_109508",  // First Platypus Bank
      initial_products: ["transactions"],
      options: {
        webhook: PropertiesService.getScriptProperties().getProperty("WEBHOOK_URL") || "https://script.google.com/macros/s/AKfycbxYszvhe8-v7YZaF78oRzVCR6JBbIUITtbjKEI8vdYk-BdXsRctAEOmcruzFXv2RQ2S/exec"
      }
    });
    
    Debug.log("Plaid.sandboxCreatePublicToken", "public_token: " + data.public_token.substring(0, 20) + "...");
    return data.public_token;
  },
  
  /**
   * Exchange a public_token for an access_token.
   */
  exchangePublicToken: function (publicToken) {
    Debug.log("Plaid.exchangePublicToken", "Exchanging public token...");
    
    const data = this._post("/item/public_token/exchange", {
      public_token: publicToken,
    });
    
    Debug.log("Plaid.exchangePublicToken", "access_token: " + data.access_token.substring(0, 20) + "...");
    Debug.log("Plaid.exchangePublicToken", "item_id: " + data.item_id);
    return data.access_token;
  },
  
  /**
   * Store an access_token for a given Item name.
   */
  storeAccessToken: function (itemName, accessToken) {
    PropertiesService.getScriptProperties().setProperty("ACCESS_TOKEN_" + itemName, accessToken);
    Debug.log("Plaid.storeAccessToken", "Stored access_token for: " + itemName);
  },
  
  /**
   * Retrieve an access_token for a given Item name.
   */
  getAccessToken: function (itemName) {
    return PropertiesService.getScriptProperties().getProperty("ACCESS_TOKEN_" + itemName);
  },
  
  /**
   * Fetch transactions via /transactions/sync.
   * Stores cursor in ScriptProperties for incremental syncs.
   * Returns { added, modified, removed } filtered to SYNC_START_DATE or later.
   * (removed entries are always passed through — they only delete matching rows.)
   */
  syncTransactions: function (itemName) {
    Debug.log("Plaid.syncTransactions", "Starting sync for: " + itemName + " (keeping " + this.SYNC_START_DATE + " and later)");

    const accessToken = this.getAccessToken(itemName);
    if (!accessToken) {
      Debug.error("Plaid.syncTransactions", "No access_token for " + itemName + ". Link it first.");
      return { added: [], modified: [], removed: [] };
    }

    const props = PropertiesService.getScriptProperties();
    const cursorKey = "CURSOR_" + itemName;
    let cursor = props.getProperty(cursorKey) || "";
    const startDate = this.SYNC_START_DATE;

    var result = { added: [], modified: [], removed: [] };
    var skippedOld = 0;
    let hasMore = true;

    while (hasMore) {
      const payload = { access_token: accessToken, count: 500 };
      if (cursor) payload.cursor = cursor;

      const data = this._post("/transactions/sync", payload);

      var batchAdded = data.added || [];
      var batchModified = data.modified || [];
      var batchRemoved = data.removed || [];
      var kept = 0;

      for (var i = 0; i < batchAdded.length; i++) {
        var d = batchAdded[i].authorized_date || batchAdded[i].date || "";
        if (!d || d >= startDate) { result.added.push(batchAdded[i]); kept++; }
        else { skippedOld++; }
      }
      for (var m = 0; m < batchModified.length; m++) {
        var md = batchModified[m].authorized_date || batchModified[m].date || "";
        if (!md || md >= startDate) { result.modified.push(batchModified[m]); }
        else { skippedOld++; }
      }
      for (var r = 0; r < batchRemoved.length; r++) {
        result.removed.push(batchRemoved[r]);
      }

      cursor = data.next_cursor || "";
      props.setProperty(cursorKey, cursor);
      hasMore = data.has_more || false;

      Debug.log("Plaid.syncTransactions", "Page: " + batchAdded.length + " fetched, " + kept + " kept, has_more=" + hasMore);
    }

    Debug.log("Plaid.syncTransactions", "Sync complete for " + itemName + ": " + result.added.length + " new, " + result.modified.length + " updated, " + result.removed.length + " removed (" + skippedOld + " old skipped, before " + startDate + ")");
    return result;
  },
  
  /**
   * Get item/account info to find account types.
   */
  getAccounts: function (itemName) {
    const accessToken = this.getAccessToken(itemName);
    const data = this._post("/accounts/get", { access_token: accessToken });
    Debug.log("Plaid.getAccounts", "Accounts: " + JSON.stringify(data.accounts.map(function(a) {
      return { id: a.account_id, name: a.name, type: a.type, subtype: a.subtype };
    })));
    return data.accounts;
  },
  
  /**
   * Fetch live balances via /accounts/balance/get.
   * Returns array of { name, type, available, current }
   */
  fetchBalances: function (itemName) {
    Debug.log("Plaid.fetchBalances", "Fetching balances for: " + itemName);
    
    const accessToken = this.getAccessToken(itemName);
    const data = this._post("/accounts/balance/get", { access_token: accessToken });
    
    var balances = [];
    for (var i = 0; i < data.accounts.length; i++) {
      var a = data.accounts[i];
      var bal = {
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        available: a.balances.available,
        current: a.balances.current,
        iso_currency_code: a.balances.iso_currency_code,
      };
      balances.push(bal);
      Debug.log("Plaid.fetchBalances", bal.name + " (" + bal.type + "): available=" + bal.available + " current=" + bal.current);
    }
    
    return balances;
  }
};
