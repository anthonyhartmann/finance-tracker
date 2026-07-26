/**
 * Link.gs — Linking real (production) bank accounts via Plaid Link.
 *
 * Flow: generateProdLinkToken() → open Hosted Link URL from debug tab →
 * connect ALL banks in one session → exchangeProdPublicToken().
 * Fallback (no hosted_link_url): plaid-link.html + exchangeProdPublicTokenManual().
 *
 * NEVER open cdn.plaid.com/link/v2/stable/link.html directly — it's the SDK's
 * inner iframe and hangs on a grey spinner. Hosted Link or the SDK page only.
 */

/**
 * Generate a Plaid Link token for a real bank connection.
 * After running this, open the Hosted Link URL (debug tab) in a browser.
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

    // Step 2: Create link token (standard) + request a Plaid-hosted Link URL
    var createPayload = {
      client_name: "Finance Tracker",
      user_id: userId,
      enable_multi_item_link: true,
      products: ["transactions", "investments"],
      country_codes: ["US"],
      language: "en",
      hosted_link: {},
      webhook: props.getProperty("WEBHOOK_URL") || "https://script.google.com/macros/s/AKfycbxYszvhe8-v7YZaF78oRzVCR6JBbIUITtbjKEI8vdYk-BdXsRctAEOmcruzFXv2RQ2S/exec"
    };
    var data = PLAID._post("/link/token/create", createPayload);

    Debug.log("generateProdLinkToken", "Link token generated.");
    Debug.log("generateProdLinkToken", "Token (for fallback page): " + data.link_token);
    PropertiesService.getScriptProperties().setProperty("LAST_LINK_TOKEN", data.link_token);
    Debug.log("generateProdLinkToken", "");
    if (data.hosted_link_url) {
      Debug.log("generateProdLinkToken", "=== OPEN THIS URL IN YOUR BROWSER (Plaid Hosted Link) ===");
      Debug.log("generateProdLinkToken", data.hosted_link_url);
      Debug.log("generateProdLinkToken", "Connect ALL banks in that page FIRST, then run exchangeProdPublicToken().");
    } else {
      Debug.log("generateProdLinkToken", "hosted_link_url was NOT returned by Plaid — using fallback page.");
      Debug.log("generateProdLinkToken", "1. Open plaid-link.html (repo root) in your browser");
      Debug.log("generateProdLinkToken", "2. Paste the link token above, connect all banks");
      Debug.log("generateProdLinkToken", "3. Copy each public_token shown on the page");
      Debug.log("generateProdLinkToken", "4. Run exchangeProdPublicTokenManual() and paste them in");
    }
  } catch (err) {
    Debug.error("generateProdLinkToken", err);
  }
}

/**
 * Exchange public_tokens after a completed Hosted Link / Multi-Item session.
 * Reads results via /link/token/get using the stored LAST_LINK_TOKEN.
 * Connect ALL banks in the session BEFORE running this — it consumes the token.
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
 * Manually exchange public_token(s) copied from the plaid-link.html fallback page.
 * Use this when Hosted Link is unavailable. Loops until you press Cancel.
 */
function exchangeProdPublicTokenManual() {
  var ui = SpreadsheetApp.getUi();
  var count = 0;

  Debug.log("exchangeProdPublicTokenManual", "Manual public_token exchange — paste tokens from plaid-link.html");

  while (true) {
    var resp = ui.prompt(
      "Exchange public_token #" + (count + 1),
      "Paste a public_token from plaid-link.html (press Cancel when done):",
      ui.ButtonSet.OK_CANCEL
    );
    if (resp.getSelectedButton() !== ui.Button.OK) break;

    var publicToken = resp.getResponseText().trim();
    if (!publicToken) {
      if (count > 0) break;  // empty paste after at least one = done
      continue;              // empty paste before any = keep asking
    }

    try {
      var accessToken = PLAID.exchangePublicToken(publicToken);

      // Try to auto-detect institution name for a sensible default
      var defaultName = "";
      try {
        var itemData = PLAID._post("/item/get", { access_token: accessToken });
        var instId = itemData.item && itemData.item.institution_id;
        if (instId) {
          var instData = PLAID._post("/institutions/get_by_id", {
            institution_id: instId,
            country_codes: ["US"]
          });
          if (instData.institution && instData.institution.name) {
            defaultName = instData.institution.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          }
        }
      } catch (lookupErr) {
        Debug.log("exchangeProdPublicTokenManual", "Institution lookup failed (non-fatal): " + lookupErr.message);
      }

      var nameResp = ui.prompt(
        "Name this account" + (defaultName ? " (detected: " + defaultName + ")" : ""),
        "Token exchanged. Enter a short name (e.g. ally, bofa, chase, discover):",
        ui.ButtonSet.OK_CANCEL
      );
      var typed = (nameResp.getSelectedButton() === ui.Button.OK) ? nameResp.getResponseText().trim().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
      var itemName = typed || defaultName || ("bank" + (count + 1));

      PLAID.storeAccessToken(itemName, accessToken);
      Debug.log("exchangeProdPublicTokenManual", "[OK] Linked: " + itemName);
      count++;
    } catch (err) {
      Debug.error("exchangeProdPublicTokenManual", err);
      ui.alert("Exchange failed: " + err.message + " — see debug tab. Press OK to continue.");
    }
  }

  if (count > 0) {
    Debug.log("exchangeProdPublicTokenManual", "[OK] " + count + " account(s) linked. Run syncAllProductionAccounts() to pull data.");
  } else {
    Debug.log("exchangeProdPublicTokenManual", "No tokens exchanged.");
  }
}
