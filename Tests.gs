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
  Debug.ensureTab();
  Debug.log("testDebugLogging", "Debug tab initialized");
  Debug.logRaw("testDebugLogging", { status: "ok", timestamp: new Date().toISOString() });
  Debug.log("testDebugLogging", "✅ Debug system works! Check the debug tab.");
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
  
  Debug.log("setupPlaidConfig", "✅ Plaid sandbox credentials stored in ScriptProperties");
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
      Debug.log("testPlaidConnection", "✅ Success! Link token received.");
      Debug.log("testPlaidConnection", `Link token preview: ${responseBody.link_token.substring(0, 20)}...`);
    } else if (responseBody.error_type) {
      Debug.error("testPlaidConnection", `Plaid error: ${responseBody.error_type} — ${responseBody.error_message}`);
    }
  } catch (err) {
    Debug.error("testPlaidConnection", err);
  }
  
  Debug.log("testPlaidConnection", "=== Plaid connection test complete ===");
}
