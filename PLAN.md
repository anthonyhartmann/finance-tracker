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
| I6 Calendar | ☐ | Interview income from Calendar |
| I7 Manual Adj | ☐ | Adjustments, overrides, no-shows |
| I8 Production | ✅ | 4 real banks linked via Hosted Link (ally, discover, bofa, chase) |
| I9 Polish | ☐ | Ignore rules, error emails, monthly summaries |

### Post-I8 hardening (2026-07-25)
- Sync cutoff: only transactions ≥ `PLAID.SYNC_START_DATE` ("2026-07-01") are kept.
- Proper sync semantics: added/modified/removed applied (pending→posted correct).
- Webhook-driven incremental sync live (TRANSACTIONS/SYNC_UPDATES_AVAILABLE → sync).
- Transactions columns: account_name (resolved from account_id, cached), date,
  merchant_name, amount first; readers must be header-name-based.
- Sandbox (platypus) tokens + fake data purged via resetAndResync().

## I8 Resolution (root cause, for the record)

`cdn.plaid.com/link/v2/stable/link.html` is Plaid Link's inner iframe — opening it
directly hangs on a grey spinner (no SDK handshake). Fixed by using Hosted Link
(`hosted_link: {}` → read `hosted_link_url` from the response). plaid.com/demo is a
marketing demo — produces NO usable tokens. Full history in git log.

## Runbooks (user runs these in the Apps Script editor)

**Link a new bank**
1. `generateProdLinkToken()` → open Hosted Link URL from debug tab
2. Connect ALL banks in that session
3. `exchangeProdPublicToken()` (consumes the link token — run only AFTER all connected)
4. `configureWebhook()` once per new item

**Sync now (manual):** `syncAllProductionAccounts()` — normally unnecessary (webhooks do it).

**Full rebuild / change history window:** edit `PLAID.SYNC_START_DATE` in Plaid.gs →
`clasp push -f` → run `resetAndResync()`.

**Verify health:** debug tab (unhide) — every function logs there; `testDebugLogging()` for sanity.

## Next Up

- **I6 Calendar:** read interview events → interview_income tab → Dashboard.calculateInterviewIncome (stub ready, reads col 5).
- **I7 Manual Adj:** adjustments tab → Dashboard.calculateManualAdjustments (stub ready, reads cols 2/4).
- **I9 Polish:** ignore rules (transfers already excluded in calculateSpend), error emails, monthly summaries.
