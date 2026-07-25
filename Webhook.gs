/**
 * Webhook.gs — Receives Plaid webhooks and triggers sync
 * 
 * Deploy this as a web app so Plaid can POST to it.
 * The URL will be: https://script.google.com/macros/s/{SCRIPT_ID}/exec
 */

/**
 * Handle incoming POST from Plaid webhook or OAuth redirect.
 */
function doPost(e) {
  Debug.ensureTab();
  
  if (!e || !e.postData) {
    Debug.log("doPost", "No POST data received");
    return ContentService.createTextOutput(JSON.stringify({ error: "no data" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var rawBody = e.postData.contents;
  Debug.log("doPost", "POST body: " + rawBody.substring(0, 500));
  
  // Check if this is a Plaid OAuth redirect with public_token
  try {
    var parsed = JSON.parse(rawBody);
    if (parsed.public_token) {
      Debug.log("doPost", "=== PLAID REDIRECT WITH PUBLIC TOKEN ===");
      Debug.log("doPost", "public_token: " + parsed.public_token);
      return ContentService.createTextOutput(JSON.stringify({ status: "token_received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (e) {
    // Not JSON, continue to normal webhook handling
  }
  
  try {
    var data = JSON.parse(rawBody);
    Debug.logRaw("doPost", data);
    
    var webhookType = data.webhook_type;
    var webhookCode = data.webhook_code;
    var itemId = data.item_id;
    
    Debug.log("doPost", "Webhook received: " + webhookType + " / " + webhookCode + " for item: " + itemId);
    
    if (webhookType === "TRANSACTIONS" && webhookCode === "SYNC_UPDATES_AVAILABLE") {
      // Find which Item this is and trigger sync
      var itemName = findItemNameByItemId(itemId);
      if (itemName) {
        Debug.log("doPost", "Triggering sync for: " + itemName);
        var transactions = PLAID.syncTransactions(itemName);
        SHEET.writeTransactions(transactions);
        
        // Also refresh balances
        var balances = PLAID.fetchBalances(itemName);
        SHEET.writeBalances(balances);
        
        Debug.log("doPost", "Sync complete: " + transactions.length + " new transactions");
      } else {
        Debug.log("doPost", "Unknown item_id: " + itemId + " — skipping");
      }
    }
    
    // Return 200 to acknowledge receipt
    return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    Debug.error("doPost", err);
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET requests — captures Plaid Link redirect with public_token.
 */
function doGet(e) {
  Debug.ensureTab();
  
  Debug.log("doGet", "GET received at " + new Date().toISOString());
  
  // Log ALL parameters for debugging
  if (e && e.parameter) {
    Debug.logRaw("doGet", { parameters: e.parameter });
  }
  if (e && e.queryString) {
    Debug.log("doGet", "Query string: " + e.queryString);
  }
  
  // Check if this is a Plaid Link redirect with a public_token
  if (e && e.parameter && e.parameter.public_token) {
    Debug.log("doGet", "=== PLAID LINK REDIRECT RECEIVED ===");
    Debug.log("doGet", "public_token: " + e.parameter.public_token);
    Debug.log("doGet", "Run exchangeProdPublicToken() and paste this token.");
    return ContentService.createTextOutput(
      "Finance Tracker - Plaid Link connected! "
      + "Public token received. Close this tab and check the debug tab."
    ).setMimeType(ContentService.MimeType.TEXT);
  }
  
  // Also check postData (Plaid might send token in POST body)
  if (e && e.postData) {
    Debug.log("doGet", "POST data present: " + e.postData.contents);
  }
  
  return ContentService.createTextOutput("Webhook endpoint is live. POST only.")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Find the local item name by Plaid's item_id.
 * Checks all stored access_tokens.
 */
function findItemNameByItemId(itemId) {
  var props = PropertiesService.getScriptProperties();
  var allKeys = props.getKeys();
  
  for (var i = 0; i < allKeys.length; i++) {
    if (allKeys[i].indexOf("ACCESS_TOKEN_") === 0) {
      var itemName = allKeys[i].replace("ACCESS_TOKEN_", "");
      // We can't reverse-lookup item_id from access_token without an API call
      // For now, log and return first match as fallback
      Debug.log("findItemNameByItemId", "Found token for: " + itemName);
    }
  }
  
  // Fallback: try to get item info for all known items
  var items = ["platypus", "platypus2", "platypus3"];
  for (var j = 0; j < items.length; j++) {
    try {
      var token = PLAID.getAccessToken(items[j]);
      if (token) {
        var data = PLAID._post("/item/get", { access_token: token });
        if (data.item && data.item.item_id === itemId) {
          return items[j];
        }
      }
    } catch (e) {
      // skip
    }
  }
  
  return null;
}

/**
 * Deploy helper: run this to get the web app URL you need to paste into Plaid.
 */
function getWebhookUrl() {
  var url = ScriptApp.getService().getUrl();
  Debug.log("getWebhookUrl", "Web app URL: " + url);
  return url;
}

/**
 * Store the webhook URL and update all existing sandbox items.
 * Run this after deploying the web app.
 */
function configureWebhook() {
  var url = "https://script.google.com/macros/s/AKfycbxYszvhe8-v7YZaF78oRzVCR6JBbIUITtbjKEI8vdYk-BdXsRctAEOmcruzFXv2RQ2S/exec";
  PropertiesService.getScriptProperties().setProperty("WEBHOOK_URL", url);
  Debug.log("configureWebhook", "Webhook URL stored: " + url);
  
  // Update webhook for all existing sandbox items
  var items = ["platypus", "platypus2", "platypus3"];
  for (var i = 0; i < items.length; i++) {
    var token = PLAID.getAccessToken(items[i]);
    if (token) {
      try {
        var data = PLAID._post("/item/webhook/update", {
          access_token: token,
          webhook: url
        });
        Debug.log("configureWebhook", "Updated webhook for: " + items[i]);
      } catch (e) {
        Debug.error("configureWebhook", "Failed for " + items[i] + ": " + e.message);
      }
    }
  }
  
  Debug.log("configureWebhook", "[OK] Webhook configured for all items.");
}
