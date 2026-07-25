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
  Debug.log("generateProdLinkToken", "Generating production link token...");
  
  var url = PLAID._baseUrl();
  if (url.indexOf("sandbox") !== -1) {
    Debug.error("generateProdLinkToken", "Still in sandbox mode. Run setupPlaidProduction() first.");
    return;
  }
  
  try {
    var data = PLAID._post("/link/token/create", {
      client_name: "Finance Tracker",
      user: { client_user_id: "anthony-1" },
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      webhook: PropertiesService.getScriptProperties().getProperty("WEBHOOK_URL"),
      link_customization_name: "default",
      redirect_uri: "https://script.google.com"
    });
    
    Debug.log("generateProdLinkToken", "Link token generated.");
    Debug.log("generateProdLinkToken", "Token: " + data.link_token);
    Debug.log("generateProdLinkToken", "");
    Debug.log("generateProdLinkToken", "=== ACTION REQUIRED ===");
    Debug.log("generateProdLinkToken", "Open this URL in a browser:");
    Debug.log("generateProdLinkToken", "https://plaid.com/link/?token=" + data.link_token);
    Debug.log("generateProdLinkToken", "Log into your bank and grant access.");
    Debug.log("generateProdLinkToken", "When done, run exchangeProdPublicToken() with the public_token from the redirect URL.");
  } catch (err) {
    Debug.error("generateProdLinkToken", err);
  }
}

/**
 * Exchange a production public_token from the Plaid Link redirect.
 */
function exchangeProdPublicToken() {
  var ui = SpreadsheetApp.getUi();
  
  var result = ui.prompt(
    "Public Token",
    "Paste the public_token from the redirect URL:",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  
  var publicToken = result.getResponseText().trim();
  if (!publicToken) {
    Debug.error("exchangeProdPublicToken", "No token provided.");
    return;
  }
  
  Debug.log("exchangeProdPublicToken", "Exchanging public_token...");
  
  try {
    var accessToken = PLAID.exchangePublicToken(publicToken);
    
    var nameResult = ui.prompt(
      "Account Name",
      "Which account is this? (e.g. ally, bofa, chase, discover):",
      ui.ButtonSet.OK_CANCEL
    );
    if (nameResult.getSelectedButton() !== ui.Button.OK) return;
    
    PLAID.storeAccessToken(nameResult.getResponseText().trim(), accessToken);
    var accounts = PLAID.getAccounts(nameResult.getResponseText().trim());
    
    Debug.log("exchangeProdPublicToken", "[OK] " + nameResult.getResponseText().trim() + " linked.");
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


