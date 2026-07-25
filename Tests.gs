/**
 * Tests.gs — Diagnostics + DEPRECATED sandbox-era tests.
 *
 * KEPT:
 * - testDebugLogging() — sanity check that the Debug system works. Safe anytime.
 *
 * DEPRECATED (sandbox era — do NOT run; production env is active):
 * - testPlaidConnection()   — hardcoded SANDBOX endpoint.
 * - linkAllSandboxAccounts() — links fake Platypus banks (tokens now removed).
 * - testMultiAccountSync()   — syncs those fake banks. Use Sync.gs instead.
 *
 * Production functions live in Setup.gs, Link.gs, Sync.gs, Webhook.gs.
 */

/**
 * Verify the debug logging system works.
 * If you see entries in the hidden "debug" tab, we're live.
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
 * @deprecated Sandbox-era smoke test (hardcoded sandbox endpoint).
 * Kept for reference only.
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
 * @deprecated Sandbox-era linker (fake Platypus banks). Production linking
 * lives in Link.gs (generateProdLinkToken → exchangeProdPublicToken).
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
 * @deprecated Sandbox-era multi-account sync. Production uses
 * syncAllProductionAccounts() in Sync.gs.
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
    var result = PLAID.syncTransactions(name);
    SHEET.writeTransactions(result);
    totalTransactions += result.added.length;

    // Fetch balances
    var balances = PLAID.fetchBalances(name);
    allBalances = allBalances.concat(balances);
  }

  // Write aggregate balances to dashboard
  SHEET.writeBalances(allBalances);

  Debug.log("testMultiAccountSync", "[OK] Multi-account sync complete.");
  Debug.log("testMultiAccountSync", "Total transactions: " + totalTransactions);
}
