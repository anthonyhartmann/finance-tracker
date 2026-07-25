# Finance Tracker — Agent Guide

Guidance for working in this codebase. **Project status, milestones, and runbooks
live in [PLAN.md](PLAN.md)** — read both before making changes.

Personal finance tracker: Plaid (bank sync) + Google Calendar (interview income)
→ Google Sheet, running on Google Apps Script.

**Sheet:** `1vrz59cWikaj3k7hOtOgrZaCc84BQ5OEaZJ0gs5YwE98`
**GitHub:** `git@github.com:anthonyhartmann/finance-tracker.git`
**Plaid:** Trial plan, production environment
**Google API key (read-only Sheets):** `AIzaSyBoYyA-QYyWH8ttnDIFJVLG42PXiv6ztAM`

## File Map

```
~/.cline/appsscript/          # Git repo root / clasp rootDir
├── Debug.gs                  # Debug.log/error/logRaw → hidden "debug" tab. Use for ALL logging.
├── Plaid.gs                  # PLAID object: API transport, tokens, sync, balances, account names.
├── SheetOps.gs               # SHEET object: all Sheet writes. Owns transactions column order.
├── Dashboard.gs              # DASHBOARD object: the 3 numbers + month selector.
├── Webhook.gs                # doPost/doGet + findItemNameByItemId + configureWebhook + refreshAllBalances.
├── Setup.gs                  # One-time credential setup (setupPlaidProduction etc).
├── Link.gs                   # Linking banks: generateProdLinkToken / exchangeProdPublicToken[/Manual].
├── Sync.gs                   # Day-to-day: syncAllProductionAccounts, syncProductionAccount, resetAndResync.
├── Tests.gs                  # Diagnostics + DEPRECATED sandbox-era tests (do not run).
├── plaid-link.html           # Local Plaid Link fallback page (open the FILE in a browser).
├── PLAN.md                   # Project status, milestones, runbooks.
├── appsscript.json           # OAuth scopes + manifest.
└── validate_rules.py         # Validates .clinerules structure.
```

## Architecture Invariants (don't break these)

- **Logging:** everything goes through `Debug.log(fnName, msg)` — never Logger.log alone.
- **ScriptProperties keys:** `PLAID_CLIENT_ID/SECRET/ENVIRONMENT`, `ACCESS_TOKEN_<item>`,
  `CURSOR_<item>`, `ITEMID_<plaid item_id>` (webhook lookup cache), `ACCT_<account_id>`
  (account name cache), `WEBHOOK_URL`, `LAST_LINK_TOKEN` (consumed by exchange).
- **Transactions tab:** column order is owned by `SHEET.writeTransactions` headers
  (`account_name, date, merchant_name, amount, transaction_id, account_id, name,
  category, payment_channel, pending, currency, synced_at`). Any code READING the tab
  must resolve columns **by header name, never by index** (Dashboard does this — copy it).
- **Sync:** `PLAID.syncTransactions(item)` returns `{ added, modified, removed }`, filtered
  to `PLAID.SYNC_START_DATE` (currently "2026-07-01"). Cursors persist per item, so after
  the first walk all syncs are tiny deltas. `SHEET.writeTransactions` applies all three
  collections via one batch rewrite (dedup/overwrite/delete by transaction_id).
- **Webhooks:** Plaid TRANSACTIONS webhooks → `doPost` → incremental sync + aggregate
  balance refresh. Item mapping via ITEMID_ cache.
- **Web app deployment:** the /exec URL runs a FIXED version. After ANY code change you
  want live on webhooks: `clasp deploy -i AKfycbxYszvhe8-v7YZaF78oRzVCR6JBbIUITtbjKEI8vdYk-BdXsRctAEOmcruzFXv2RQ2S -d "desc"` (URL unchanged).
- **Plaid Link:** NEVER open `cdn.plaid.com/link/v2/stable/link.html` directly (it's the
  SDK's inner iframe → infinite grey spinner). Use Hosted Link (`hosted_link: {}` →
  `hosted_link_url` in response) or plaid-link.html (which loads link-initialize.js).

## Dev Workflow

1. Edit → syntax check: `node -e "new Function(fs.readFileSync('FILE.gs','utf8'))"`
2. `git add -A && git commit -m "..."` → `git push` (EPERM warning on credential cache is normal; push succeeds)
3. `clasp push -f` from `~/.cline` (where .clasp.json lives)
4. If Webhook.gs behavior must go live: `clasp deploy -i <id above>` (bumps version, same URL)
5. Tell the user exactly what to run in the Apps Script editor to verify.

## Reading the Sheet (from shell)

```
curl -s 'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{TAB_NAME}?key={API_KEY}'
```
Tabs: Sheet1 (0), debug (711367457), transactions (gid changes on rebuild — read by NAME), dashboard (2006033775).

## Shell Sandbox

`sandbox-exec` profile `~/.cline/sandbox.sb`: writes allowed to `~/.cline/`, `/tmp`.
`open`, `osascript`, SSH blocked. No sudo.
