/**
 * Tests.gs — Test functions for validating each integration point
 * 
 * Run these from the Apps Script editor to verify things work.
 * Each test logs its output to the Debug tab.
 */

/**
 * Test 1: Verify the debug logging system works.
 * Run this first — if you see entries in the hidden "debug" tab, we're live.
 */
function testDebugLogging() {
  // Self-test: validate Debug module loaded
  if (typeof Debug === 'undefined') {
    throw new Error(
      'Debug module not found. Check that Debug.gs exists and has no syntax errors. '
      + 'If you see "ReferenceError: Debug is not defined", the file didn\'t compile.'
    );
  }
  if (typeof Debug.ensureTab !== 'function') {
    throw new Error('Debug.ensureTab() is missing — Debug.gs may be corrupted.');
  }
  
  Debug.ensureTab();
  Debug.log("testDebugLogging", "Self-test passed — Debug module loaded correctly");
  Debug.log("testDebugLogging", "Debug tab initialized");
  Debug.logRaw("testDebugLogging", { status: "ok", timestamp: new Date().toISOString() });
  Debug.log("testDebugLogging", "[OK] Debug system works. Check the debug tab.");
}

/**
 * Store Plaid sandbox credentials in ScriptProperties.
 * Run this ONCE before testPlaidConnection().
 */
function setupPlaidConfig() {
  const ui = SpreadsheetApp.getUi();
  
  const clientId = ui.prompt(
    "Plaid Client ID",
    "Enter your Plaid Sandbox client_id:",
    ui.ButtonSet.OK_CANCEL
  );
  if (clientId.getSelectedButton() !== ui.Button.OK) return;
  
  const secret = ui.prompt(
    "Plaid Secret",
    "Enter your Plaid Sandbox secret:",
    ui.ButtonSet.OK_CANCEL
  );
  if (secret.getSelectedButton() !== ui.Button.OK) return;
  
  const props = PropertiesService.getScriptProperties();
  props.setProperty("PLAID_CLIENT_ID", clientId.getResponseText());
  props.setProperty("PLAID_SECRET", secret.getResponseText());
  props.setProperty("PLAID_ENVIRONMENT", "sandbox");
  
  Debug.log("setupPlaidConfig", "[OK] Plaid sandbox credentials stored in ScriptProperties");
}

/**
 * Test 2: Verify we can talk to the Plaid Sandbox API.
 * 
 * Calls POST /link/token/create and logs the full response.
 * If this works, the HTTP layer is validated.
 */
function testPlaidConnection() {
  Debug.ensureTab();
  Debug.log("testPlaidConnection", "=== Starting Plaid connection test ===");
  
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty("PLAID_CLIENT_ID");
  const secret = props.getProperty("PLAID_SECRET");
  
  if (!clientId || !secret) {
    Debug.error("testPlaidConnection", "Missing Plaid credentials. Run setupPlaidConfig() first.");
    return;
  }
  
  const url = "https://sandbox.plaid.com/link/token/create";
  const payload = {
    client_id: clientId,
    secret: secret,
    client_name: "Finance Tracker",
    user: { client_user_id: "user-1" },
    products: ["transactions"],
    country_codes: ["US"],
    language: "en"
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  Debug.log("testPlaidConnection", `POST ${url}`);
  Debug.logRaw("testPlaidConnection", { request: payload });
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = JSON.parse(response.getContentText());
    
    Debug.log("testPlaidConnection", `Response code: ${responseCode}`);
    Debug.logRaw("testPlaidConnection", responseBody);
    
    if (responseBody.link_token) {
      Debug.log("testPlaidConnection", "[OK] Success! Link token received.");
      Debug.log("testPlaidConnection", "Link token preview: " + responseBody.link_token.substring(0, 20) + "...");
    } else if (responseBody.error_type) {
      Debug.error("testPlaidConnection", `Plaid error: ${responseBody.error_type} — ${responseBody.error_message}`);
    }
  } catch (err) {
    Debug.error("testPlaidConnection", err);
  }
  
  Debug.log("testPlaidConnection", "=== Plaid connection test complete ===");
}

/**
 * Link multiple sandbox accounts for testing.
 * Creates: Platypus Bank (checking/savings), Second Platypus (credit), Third Platypus (credit)
 * Run this once before testMultiAccountSync().
 */
function linkAllSandboxAccounts() {
  Debug.log("linkAllSandboxAccounts", "=== Linking all sandbox accounts ===");
  
  var accounts = [
    { name: "platypus", institution: "ins_109508", desc: "First Platypus (checking + savings)" },
    { name: "platypus2", institution: "ins_109509", desc: "Second Platypus (credit card)" },
    { name: "platypus3", institution: "ins_109510", desc: "Third Platypus (credit card)" },
  ];
  
  for (var i = 0; i < accounts.length; i++) {
    var acct = accounts[i];
    if (PLAID.getAccessToken(acct.name)) {
      Debug.log("linkAllSandboxAccounts", "Already linked: " + acct.name + " — " + acct.desc);
      continue;
    }
    
    Debug.log("linkAllSandboxAccounts", "Linking: " + acct.name + " — " + acct.desc);
    
    var data = PLAID._post("/sandbox/public_token/create", {
      institution_id: acct.institution,
      initial_products: ["transactions"],
    });
    
    var accessToken = PLAID.exchangePublicToken(data.public_token);
    PLAID.storeAccessToken(acct.name, accessToken);
  }
  
  Debug.log("linkAllSandboxAccounts", "[OK] All sandbox accounts linked.");
}

/**
 * Sync transactions AND balances for all linked sandbox accounts.
 * Writes to the transactions tab and dashboard.
 */
function testMultiAccountSync() {
  Debug.log("testMultiAccountSync", "=== Starting multi-account sync test ===");
  
  var itemNames = ["platypus", "platypus2", "platypus3"];
  var totalTransactions = 0;
  var allBalances = [];
  
  for (var i = 0; i < itemNames.length; i++) {
    var name = itemNames[i];
    var token = PLAID.getAccessToken(name);
    
    if (!token) {
      Debug.log("testMultiAccountSync", "Skipping " + name + " — not linked yet");
      continue;
    }
    
    Debug.log("testMultiAccountSync", "Syncing: " + name);
    
    // Sync transactions
    var transactions = PLAID.syncTransactions(name);
    SHEET.writeTransactions(transactions);
    totalTransactions += transactions.length;
    
    // Fetch balances
    var balances = PLAID.fetchBalances(name);
    allBalances = allBalances.concat(balances);
  }
  
  // Write aggregate balances to dashboard
  SHEET.writeBalances(allBalances);
  
  Debug.log("testMultiAccountSync", "[OK] Multi-account sync complete.");
  Debug.log("testMultiAccountSync", "Total transactions: " + totalTransactions);
}

/**
 * Switch Plaid to production mode and store Trial plan API keys.
 * Run this BEFORE generateProdLinkToken().
 */
function setupPlaidProduction() {
  var ui = SpreadsheetApp.getUi();
  
  var result = ui.alert(
    "Production Setup",
    "This will switch from Sandbox to Production. You need your Trial plan "
    + "client_id and secret from dashboard.plaid.com. Continue?",
    ui.ButtonSet.OK_CANCEL
  );
  if (result !== ui.Button.OK) return;
  
  var clientId = ui.prompt("Production Client ID:", ui.ButtonSet.OK_CANCEL);
  if (clientId.getSelectedButton() !== ui.Button.OK) return;
  
  var secret = ui.prompt("Production Secret:", ui.ButtonSet.OK_CANCEL);
  if (secret.getSelectedButton() !== ui.Button.OK) return;
  
  var props = PropertiesService.getScriptProperties();
  props.setProperty("PLAID_CLIENT_ID", clientId.getResponseText());
  props.setProperty("PLAID_SECRET", secret.getResponseText());
  props.setProperty("PLAID_ENVIRONMENT", "production");
  props.setProperty("WEBHOOK_URL", "https://script.google.com/macros/s/AKfycbxYszvhe8-v7YZaF78oRzVCR6JBbIUITtbjKEI8vdYk-BdXsRctAEOmcruzFXv2RQ2S/exec");
  
  Debug.log("setupPlaidProduction", "[OK] Switched to production. Generate link tokens below.");
}

/**
 * Generate a Plaid Link token for a real bank connection.
 * After running this, open the returned URL in a browser to connect your bank.
 */
function generateProdLinkToken() {
  Debug.log("generateProdLinkToken", "Generating Multi-Item Link token (one session for all banks)...");
  
  var props = PropertiesService.getScriptProperties();
  var env = props.getProperty("PLAID_ENVIRONMENT") || "sandbox";
  if (env !== "production") {
    Debug.error("generateProdLinkToken", "Still in sandbox mode. Run setupPlaidProduction() first.");
    return;
  }
  
  var clientId = props.getProperty("PLAID_CLIENT_ID");
  if (!clientId) {
    Debug.error("generateProdLinkToken", "No client_id found. Run setupPlaidProduction() first.");
    return;
  }
  
  try {
    // Step 1: Create a user for Multi-Item Link
    Debug.log("generateProdLinkToken", "Creating user for Multi-Item Link...");
    var userResult = PLAID._post("/user/create", {
      client_user_id: "anthony-" + new Date().getTime()
    });
    var userId = userResult.user_id;
    Debug.log("generateProdLinkToken", "User ID: " + userId);
    props.setProperty("PLAID_USER_ID", userId);
    
    // Step 2: Create Hosted Link token
    var data = PLAID._post("/link/token/create", {
      client_name: "Finance Tracker",
      user_id: userId,
      enable_multi_item_link: true,
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      hosted_link: {}
    });
    
    var hostedLinkUrl = data.hosted_link.url;
    Debug.log("generateProdLinkToken", "Hosted Link URL generated.");
    Debug.log("generateProdLinkToken", "Token: " + data.link_token);
    PropertiesService.getScriptProperties().setProperty("LAST_LINK_TOKEN", data.link_token);
    Debug.log("generateProdLinkToken", "Saved for exchangeProdPublicToken().");
    Debug.log("generateProdLinkToken", "");
    Debug.log("generateProdLinkToken", "=== OPEN THIS URL IN YOUR BROWSER ===");
    Debug.log("generateProdLinkToken", hostedLinkUrl);
    Debug.log("generateProdLinkToken", "Connect all 4 banks, then close the tab.");
    Debug.log("generateProdLinkToken", "Then run exchangeProdPublicToken() to collect the tokens.");
  } catch (err) {
    Debug.error("generateProdLinkToken", err);
  }
}

/**
 * Exchange a production public_token from the Plaid Link redirect.
 */
function exchangeProdPublicToken() {
  var props = PropertiesService.getScriptProperties();
  var linkToken = props.getProperty("LAST_LINK_TOKEN");
  
  if (!linkToken) {
    Debug.error("exchangeProdPublicToken", "No saved link_token found. Run generateProdLinkToken() first.");
    return;
  }
  
  Debug.log("exchangeProdPublicToken", "Checking Multi-Item Link session status...");
  
  try {
    var data = PLAID._post("/link/token/get", {
      link_token: linkToken
    });
    
    Debug.logRaw("exchangeProdPublicToken", data);
    
    // Check for item_add_results (Multi-Item Link)
    var items = [];
    if (data.results && data.results.item_add_results) {
      items = data.results.item_add_results;
    } else if (data.link_sessions && data.link_sessions.length > 0) {
      var session = data.link_sessions[data.link_sessions.length - 1];
      if (session.results && session.results.item_add_results) {
        items = session.results.item_add_results;
      }
    }
    
    if (items.length === 0) {
      Debug.error("exchangeProdPublicToken", "No connected banks found. Complete the Plaid Link flow first.");
      Debug.log("exchangeProdPublicToken", "Raw response: " + JSON.stringify(data));
      return;
    }
    
    Debug.log("exchangeProdPublicToken", "Found " + items.length + " connected bank(s). Exchanging tokens...");
    
    var ui = SpreadsheetApp.getUi();
    for (var i = 0; i < items.length; i++) {
      var publicToken = items[i].public_token;
      var institutionName = items[i].institution ? items[i].institution.name : "Bank " + (i + 1);
      
      Debug.log("exchangeProdPublicToken", "Exchanging token for: " + institutionName);
      
      var accessToken = PLAID.exchangePublicToken(publicToken);
      
      var nameResult = ui.prompt(
        "Name this account",
        "Connected: " + institutionName + " -- Enter a short name (e.g. ally, bofa, chase, discover):",
        ui.ButtonSet.OK_CANCEL
      );
      var itemName = (nameResult.getSelectedButton() === ui.Button.OK) ? nameResult.getResponseText().trim() : institutionName.toLowerCase().replace(/[^a-z0-9]/g, "");
      
      PLAID.storeAccessToken(itemName, accessToken);
      Debug.log("exchangeProdPublicToken", "[OK] " + itemName + " linked.");
    }
    
    props.deleteProperty("LAST_LINK_TOKEN");
    props.deleteProperty("PLAID_USER_ID");
    Debug.log("exchangeProdPublicToken", "[OK] All banks linked. Run syncAllProductionAccounts() to pull data.");
  } catch (err) {
    Debug.error("exchangeProdPublicToken", err);
  }
}

/**
 * Sync a single production account after linking.
 */
function syncProductionAccount(itemName) {
  if (!itemName) {
    itemName = SpreadsheetApp.getUi().prompt("Item Name:", SpreadsheetApp.getUi().ButtonSet.OK_CANCEL).getResponseText().trim();
  }
  
  Debug.log("syncProductionAccount", "Syncing: " + itemName);
  
  var transactions = PLAID.syncTransactions(itemName);
  SHEET.writeTransactions(transactions);
  
  var balances = PLAID.fetchBalances(itemName);
  SHEET.writeBalances(balances);
  
  Debug.log("syncProductionAccount", "[OK] " + itemName + " synced: " + transactions.length + " transactions.");
}

/**
 * Sync ALL linked production accounts and refresh dashboard.
 */
function syncAllProductionAccounts() {
  Debug.log("syncAllProductionAccounts", "Syncing all linked accounts...");
  
  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys();
  var synced = 0;
  
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf("ACCESS_TOKEN_") === 0) {
      var itemName = keys[i].replace("ACCESS_TOKEN_", "");
      Debug.log("syncAllProductionAccounts", "Syncing: " + itemName);
      
      try {
        var transactions = PLAID.syncTransactions(itemName);
        SHEET.writeTransactions(transactions);
        
        var balances = PLAID.fetchBalances(itemName);
        SHEET.writeBalances(balances);
        
        Debug.log("syncAllProductionAccounts", itemName + " done: " + transactions.length + " transactions");
        synced++;
      } catch (e) {
        Debug.error("syncAllProductionAccounts", itemName + " failed: " + e.message);
      }
    }
  }
  
  // Refresh dashboard
  DASHBOARD.refresh();
  
  Debug.log("syncAllProductionAccounts", "[OK] " + synced + " accounts synced. Dashboard refreshed.");
}


