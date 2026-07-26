# Finance Tracker — Plan, Status & Runbooks

Project-specific state lives here. Codebase conventions live in [AGENTS.md](AGENTS.md).

## Milestones

| Milestone | Status | What |
|---|---|---|
| I1 Foundation | ✅ | Git, CLASP, Debug tab, Plaid sandbox connection |
| I2 Single Sync | ✅ | One sandbox bank syncing to sheet |
| I3 Multi-Account | ✅ | 3 sandbox banks + balances |
| I4 Webhooks | ✅ | `doPost()` receiver deployed (currently @3, URL unchanged since @2) |
| I5 Dashboard | ✅ | 3 numbers (Spend, Net Income, Daily Budget) + month selector |
| I6 Calendar | ✅ | Interview income from Calendar — live income formulas, settings, reset on rollover |
| I7 Manual Adj | ✅ | Adjustments tab (amount + description only), auto id + created_at |
| I8 Production | ✅ | 4 real banks linked via Hosted Link (ally, discover, bofa, chase) |
| I9 Polish | ✅ | Recurring transactions (upcoming bills), savings tracker, monthly snapshot, dashboard summary |

### Post-I8 hardening (2026-07-25)
- Sync cutoff: only transactions ≥ `PLAID.SYNC_START_DATE` ("2026-07-01") are kept.
- Proper sync semantics: added/modified/removed applied (pending→posted correct).
- Webhook-driven incremental sync live (TRANSACTIONS/SYNC_UPDATES_AVAILABLE → sync).
- Transactions columns: account_name (resolved from account_id, cached), date,
  merchant_name, amount first; readers must be header-name-based.
- Sandbox (platypus) tokens + fake data purged via resetAndResync().

### Post-I9 features (2026-07-25)
- **Calendar income (I6):** `Calendar.gs` parses Google Calendar for interview events.
  Standard=$85, non-standard=$115, cancellation=$75, all × Tax Scalar (0.7).
  Manual inputs: `# Non-Standard Interviews` transforms existing events, `# Late Cancellations` adds cancellation income.
  `Count Upcoming Interviews` setting. All reset to 0 on month rollover.
- **Manual adjustments (I7):** `Manual.gs` tab — user enters `amount` + optional `description`.
  `id` = row number, `created_at` = row modification time (formula).
- **Recurring transactions:** `Recurring.gs` tracks expected monthly/weekly bills with flexible name matching.
  Monthly: "has it posted this month?" adds to upcoming total if not.
  Weekly (e.g., Headway): `(4 × cost) - (posted × cost)`.
  `Include Upcoming in Spend` dashboard setting.
- **Savings tracker:** `Savings.gs` — completely isolated from main sync.
  Uses `/transactions/get` (arbitrary date ranges) + `/investments/transactions/get` (401k contributions).
  Queries `ally`, `bofa`, `fidelity` only. Manual adjustment columns for pre-linking historical data.
- **Monthly snapshot:** `Snapshot.gs` dumps full sheet state before month rollover.
- **Dashboard savings summary:** Total saved, avg monthly savings, months saved (live formulas).

## I8 Resolution (root cause, for the record)

`cdn.plaid.com/link/v2/stable/link.html` is Plaid Link's inner iframe — opening it
directly hangs on a grey spinner (no SDK handshake). Fixed by using Hosted Link
(`hosted_link: {}` → read `hosted_link_url` from the response). plaid.com/demo is a
marketing demo — produces NO usable tokens. Full history in git log.

## Runbooks (user runs these in the Apps Script editor)

**Link a new bank**
1. `generateProdLinkToken()` → open Hosted Link URL from debug tab
2. Connect the bank(s) you want to add
3. `exchangeProdPublicToken()` (consumes the link token — run only AFTER all connected)
4. `configureWebhook()` once per new item

**Add investments product to existing bank (e.g., Fidelity 401k)**
1. `generateProdLinkToken()` → open Hosted Link URL
2. **Only** connect the bank you want to upgrade (don't re-connect others)
3. `exchangeProdPublicToken()` → name it the same as before (e.g., `fidelity`)
4. Existing tokens are untouched — the new one overwrites with additional products

**Sync now (manual):** `syncAllProductionAccounts()` — normally unnecessary (webhooks do it).

**Full rebuild / change history window:** edit `PLAID.SYNC_START_DATE` in Plaid.gs →
`clasp push -f` → run `resetAndResync()`.

**Backfill savings tracker:** `backfillSavingsYear()` → `populateManualAdjustments()`

**Monthly snapshot before rollover:** `takeMonthlySnapshot()`

**Verify health:** debug tab (unhide) — every function logs there; `testDebugLogging()` for sanity.

## Next Up

- Everything from I1–I9 is shipped. The tracker is fully functional.
- Potential future enhancements (not committed):
  - **Ignore rules / categorization:** auto-tag transactions (e.g., "food", "transport")
  - **Error emails:** notify on sync failures or webhook errors
  - **Multi-month dashboard view:** compare month-over-month trends
  - **Tax optimization:** HSA, IRA contribution tracking alongside 401k
