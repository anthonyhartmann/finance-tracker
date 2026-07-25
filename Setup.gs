/**
 * Setup.gs — One-time credential/environment configuration.
 *
 * These store Plaid keys in ScriptProperties. Run once per environment.
 * For day-to-day operations see Sync.gs; for linking banks see Link.gs.
 */

/**
 * Store Plaid sandbox credentials in ScriptProperties.
 * (Sandbox is deprecated for this project — kept for reference.)
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

  Debug.log("setupPlaidProduction", "[OK] Switched to production. Run generateProdLinkToken() to link banks.");
}
