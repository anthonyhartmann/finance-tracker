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
├── Dashboard.gs              # DASHBOARD object: the 3 numbers + month selector + interview settings + savings summary.
├── Webhook.gs                # doPost/doGet + findItemNameByItemId + configureWebhook + refreshAllBalances.
├── Setup.gs                  # One-time credential setup (setupPlaidProduction etc).
├── Link.gs                   # Linking banks: generateProdLinkToken / exchangeProdPublicToken[/Manual]. Products include "investments".
├── Sync.gs                   # Day-to-day: syncAllProductionAccounts, syncProductionAccount, resetAndResync.
├── Calendar.gs               # Interview income: parses Google Calendar events, counts per month, writes interview_income tab.
├── Manual.gs                 # Manual adjustments tab: amount + optional description only. Auto id + created_at.
├── Recurring.gs              # Recurring transactions: expected bills, matching against actual, upcoming unpaid total.
├── Savings.gs                # Isolated savings tracker: /transactions/get + /investments/transactions/get. Separate from main sync.
├── Snapshot.gs               # Monthly snapshot: dumps full sheet state before month rollover.
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

## Key Learnings (Session 2026-07-25)

### Calendar Income (I6)
- `Calendar.gs` parses a specific Google Calendar for interview events
- Standard interviews = $85 gross, non-standard = $115, cancellations = $75
- All multiplied by `Tax Scalar` (default 0.7) — user-adjustable in dashboard
- Manual inputs: `# Non-Standard Interviews` transforms existing events (adds $30 each, capped at actual count)
- `# Late Cancellations` adds cancellation income manually (event removed from calendar)
- `Count Upcoming Interviews` setting toggles whether future events count toward income
- Settings reset to 0 on month rollover

### Manual Adjustments (I7)
- `Manual.gs` tab: user enters `amount` + optional `description` only
- `id` = row number, `created_at` = row modification time (formula)
- No metadata fields required — dead simple

### Recurring Transactions
- `Recurring.gs` tracks expected monthly/weekly bills with flexible name matching
- Monthly: "has this bill posted this month?" If not, adds to `upcoming_recurring_total`
- Weekly (e.g., Headway): expects 4 postings/month, adds `(4 × cost) - (already posted × cost)`
- Uses resolved merchant names from actual transactions for future matching
- `Include Upcoming in Spend` dashboard setting controls whether upcoming bills are included in net spend

### Savings Tracker (I9+)
- **Completely isolated** from main sync — uses `/transactions/get` (not sync cursors), so arbitrary date ranges work
- **Different sync start dates per workflow are fine** — Savings doesn't touch cursors
- Queries only `ally`, `bofa`, `fidelity` — skips `discover`, `chase`
- Bank transaction history only goes back to account linking date (~April 2026 for BofA)
- **Manual adjustment columns** (`manual_transfers`, `manual_retirement`, `manual_ally_out`) preserve pre-linking historical data
- `populateManualAdjustments()` handles Date objects from Sheets (not just strings)

### Investment / 401k Data
- `/investments/transactions/get` requires the **`investments` product** during Link (not just `transactions`)
- 401k contributions: `subtype === "contribution"` with **negative amounts** (money going IN)
- Use `Math.abs()` to convert to positive savings
- Ally/BofA will return `PRODUCT_NOT_ENABLED` for investments — handle gracefully
- `generateProdLinkToken()` creates a **new session** — existing tokens untouched. Add one bank at a time.

### Adding Banks
- `generateProdLinkToken()` → open Hosted Link URL → connect bank → `exchangeProdPublicToken()` → name it
- Existing `ACCESS_TOKEN_*` keys are never touched — safe to add one bank at a time
- Only re-connect banks if you want to add products (e.g., investments to existing Fidelity)

## Shell Sandbox

`sandbox-exec` profile `~/.cline/sandbox.sb`: writes allowed to `~/.cline/`, `/tmp`.
`open`, `osascript`, SSH blocked. No sudo.
