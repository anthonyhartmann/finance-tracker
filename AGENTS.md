# Finance Tracker — Agent Guide

## Project Overview

Personal finance tracker synced from bank accounts (via Plaid) + interview income (via Google Calendar) into a Google Sheet, running on Google Apps Script.

**Sheet:** Finance Tracker (`1vrz59cWikaj3k7hOtOgrZaCc84BQ5OEaZJ0gs5YwE98`)
**GitHub:** `git@github.com:anthonyhartmann/finance-tracker.git`
**Plaid:** Trial plan, production environment
**Google API Key:** `AIzaSyBoYyA-QYyWH8ttnDIFJVLG42PXiv6ztAM` (read-only sheets access)

## File Structure

```
~/.cline/appsscript/          # Git repo root
├── Debug.gs                  # Centralized logging — hidden "debug" tab
├── Plaid.gs                  # Plaid API: tokens, sync, balances
├── SheetOps.gs               # Sheet write operations
├── Dashboard.gs              # The 3 numbers + month selector
├── Webhook.gs                # Webhook receiver (doPost/doGet)
├── Tests.gs                  # All test/action functions user runs
├── plaid-link.html           # Local Plaid Link fallback page (open in browser; NOT clasp-pushed)
├── appsscript.json           # OAuth scopes + manifest
├── validate_rules.py         # Validates .clinerules structure
└── .clasp.json               # CLASP config (parent dir)
```

## Infrastructure

### CLASP (Code Deploy)
- Code lives in `~/.cline/appsscript/`
- `clasp push -f` deploys to Google Apps Script
- `clasp pull` syncs Google changes back to local
- Credentials stored at `~/.clasprc.json`

### Git
- `~/.cline/` has its own git repo tracking `.clinerules` only
- `~/.cline/appsscript/` is the main code repo
- Push fails sometimes with sandbox EPERM on credential cache, but the push itself succeeds

### Sandbox
- Runs under `sandbox-exec` with profile at `~/.cline/sandbox.sb`
- Writes allowed: `~/.cline/`, `/tmp`, `/private/tmp`, `/private/var/folders`
- `open` (browser), `osascript`, SSH all blocked
- Google Sheets API with key works for reading data
- No `sudo` access

## What's Built (Milestones)

| Milestone | Status | What |
|---|---|---|
| I1 Foundation | ✅ | Git, CLASP, Debug tab, Plaid sandbox connection test |
| I2 Single Sync | ✅ | One sandbox bank syncing to sheet |
| I3 Multi-Account | ✅ | 3 sandbox banks + balances |
| I4 Webhooks | ✅ | `doPost()` receiver deployed, webhook URL live |
| I5 Dashboard | ✅ | 3 numbers (Spend, Net Income, Daily Budget) + month selector |
| I6 Calendar | □ | Interview income from Calendar |
| I7 Manual Adj | □ | Adjustments, overrides, no-shows |
| I8 Production | 🟡 **FIX DEPLOYED** | Root cause found — see below; awaiting user test |
| I9 Polish | □ | Ignore rules, error emails, monthly summaries |

## Key Functions (Run from Apps Script Editor)

### Already Run (don't re-run unless starting fresh)
- `setupPlaidConfig()` — stored sandbox keys
- `testDebugLogging()` — validated logger
- `testPlaidConnection()` — validated Plaid sandbox
- `linkAllSandboxAccounts()` — linked 3 sandbox banks
- `testMultiAccountSync()` — synced all sandbox
- `initDashboard()` — created dashboard tab
- `configureWebhook()` — set webhook URL on sandbox items
- `setupPlaidProduction()` — stored production keys

### For Production (I8)
- `generateProdLinkToken()` — creates link token + user for Multi-Item Link; logs Hosted Link URL
- `exchangeProdPublicToken()` — retrieves tokens after a Hosted Link session (via /link/token/get)
- `exchangeProdPublicTokenManual()` — paste public_token(s) from the plaid-link.html fallback page
- `syncAllProductionAccounts()` — syncs all linked production accounts

## I8 — ROOT CAUSE FOUND, FIX DEPLOYED (awaiting user test)

### Root Cause
`https://cdn.plaid.com/link/v2/stable/link.html` is **not a launchable page** — it's the inner
iframe that the official Link JS SDK (`link-initialize.js`) loads and initializes via a
cross-frame `postMessage` handshake. Opened directly in a tab, the handshake never happens →
infinite grey spinner. Every failed attempt used this URL, so no query-param change could work.

Also verified dead ends: `plaid.com/demo` is a marketing demo with simulated data (no real
public_token). The earlier Hosted Link attempt failed only because the response field is
**`hosted_link_url`** (top-level), not `hosted_link.url`.

### The New Flow (two paths)
1. **Primary — Hosted Link:** `generateProdLinkToken()` sends `hosted_link: {}` and logs the
   returned `hosted_link_url`. Open it (a real Plaid-hosted page), connect all banks
   (Multi-Item Link stays on), then run `exchangeProdPublicToken()` — `/link/token/get` is the
   documented way to collect tokens from Hosted Link sessions.
2. **Fallback — local SDK page:** open `plaid-link.html` (repo root) in a browser, paste the
   link token (logged to debug tab), connect banks; each public_token displays on the page.
   Then run `exchangeProdPublicTokenManual()` and paste each token.

### Historical attempts (all failed for the root cause above)
1–8: every variation of opening `cdn.plaid.com/link/v2/stable/link.html?token=...` directly
(key/no-key, redirect_uri set/unset, webhook on/off, customization on/off, multi-item on/off)
→ infinite spinner, always. `redirect_uri` must NOT be set unless registered in the Plaid
Dashboard (OAuth banks use Plaid's default hosted redirect when unset).

## Reading the Sheet

Read data via the Google Sheets API with the API key:
```
curl -s 'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{TAB_NAME}?key={API_KEY}'
```

Tabs and their gids:
| Tab | gid |
|---|---|
| Sheet1 | 0 |
| debug | 711367457 |
| transactions | 766890938 |
| dashboard | 2006033775 |

## Dev Workflow

1. Write code → `node -e "new Function(fs.readFileSync('FILE.gs','utf8'))"` → syntax check
2. `git add -A && git commit -m "message"`
3. `git push` (may show EPERM but succeeds)
4. `clasp push -f`
5. Tell user what to run to test
