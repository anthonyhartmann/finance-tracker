# Personal Finance Tracker — Investigation & Plan
> **Progress:** I1 ✅ I2 ✅ I3 ✅ I4 ✅ I5 ✅ I6 □ I7 □ I9 □ **I8 moved up (next)**


## 1. Plaid Integration — Trial Plan

### Tier & Usage

| Item | Detail |
|---|---|
| **Tier** | **Trial Plan** — free production access, up to 10 Items (we need ~4) |
| **APIs used** | `/transactions/sync` (transactions) + `/accounts/balance/get` (live balances) |
| **Sync cadence** | 2x/day (no API call limits to worry about) |
| **Webhooks** | **Required** — `SYNC_UPDATES_AVAILABLE` for auto-sync (no manual polling) |
| **Link token duration** | Max `days_requested` (730) |
| **Link redirect_uri** | Need a dummy redirect URI configured in Plaid Dashboard (Link is a browser flow — you open it, I can't) |
| **Cursor management** | 4 Items = 4 separate access_tokens + 4 cursors stored in ScriptProperties |
| **Transaction fields** | Keep all fields — Plaid doesn't charge per-field |
| **Ignore rules** | TBD — e.g. recurring transfers between own accounts, small amounts under a threshold |

### Transaction Sync API Flow

1. **Create Link Token** → `POST /link/token/create` with product `transactions` and `days_requested=730`
2. **You open Plaid Link in a browser** — I can generate the link_token but cannot open the browser for you. You log into your bank, grant access.
3. **Exchange token** → `POST /item/public_token/exchange` → get `access_token`
4. **Sync transactions** → `POST /transactions/sync`:
   - First call: no cursor → returns initial batch + `next_cursor`
   - Subsequent calls: pass `cursor` param → get only new/changed/removed transactions since last sync
   - Paginate via `has_more` flag
5. **Webhook handler** — `SYNC_UPDATES_AVAILABLE` fires when new data is ready; Apps Script trigger responds
6. **Fetch live balances** — `POST /accounts/balance/get` for each Item to get current & available balances (separate from transaction sync)

### Accounts to Connect

| Account | Institution | Type |
|---|---|---|
| Long-term savings | Ally | Savings |
| Short-term savings | Bank of America | Savings (mostly empty) |
| Checking | Bank of America | Checking |
| Credit card | Chase | Credit |
| Credit card | Discover | Credit |

~4 Plaid "Items" (Ally, BofA, Chase, Discover). BofA checking + savings share one Item.

### Transaction Data Fields

`transaction_id`, `amount`, `iso_currency_code`, `date`, `authorized_date`, `name`, `merchant_name`, `personal_finance_category`, `payment_channel` (in store, online, other), `pending` (boolean), `pending_transaction_id`, `account_id`, `logo_url`, `website`, `address`, `city`, `state`, `transaction_type`

---

## 2. Rippling Integration

### API Status
**No public employee-level API available.** Rippling's API is gated behind enterprise admin credentials. Personal access tokens, developer portal, and employee-level endpoints all confirmed unavailable.

### Solution: Calendar-Parsed + Manual Override Interview Income Tracker

Replace automated Rippling sync with income data parsed from Google Calendar events, plus manual overrides for edge cases. Interviews are scheduled by third parties (recruiters), so the user doesn't maintain the calendar — the parser reads whatever format they arrive in.

#### Interview Types & Rates

| Interview Type | Base Rate |
|---|---|
| No Show | $75 (informational — no-shows pay $0, just tracked for records) |
| Coding / System Design / Behavioral | $85 |
| Other | $115 |

**Tax scalar:** 0.7 (applied to gross → net)

#### Income Tracking — Calendar Integration

**Auto-parsed from Google Calendar (read-only, populated by Apps Script):**

| Column | Type | Source |
|---|---|---|
| `date` | Date | Calendar event start time |
| `title` | Text | Calendar event title |
| `parsed_type` | Text | $85 or $115 — determined by keyword parser (exact rules TBD on first data inspection) |
| `status` | Text | Past / Upcoming |

Parser rules will be informed by inspecting actual calendar events — the format varies by recruiter/scheduler and will be handled at integration time.

**Manual Overrides (user-editable):**

| Column | Type | Notes |
|---|---|---|
| `override_type` | Dropdown | $85 → $115, $115 → $85, No Show ($75), No Change |
| `date` | Date | References the calendar event date |
| `reason` | Text | e.g. "Turned into coaching at game time" |

**No-Shows (manual, since they're removed from Calendar):**

| Column | Type | Notes |
|---|---|---|
| `date` | Date | When the no-show happened |
| `notes` | Text | Company or context |

**Summary formula logic:**
- **Past confirmed income** = (count of past $85 events × $85 × 0.7) + (count of past $115 events × $115 × 0.7), adjusted for overrides, minus no-shows
- **Upcoming potential** = same but for future events, with `include_upcoming` checkbox toggle
- **Override precedence** — overrides always win over parsed type
- **No-shows** — subtracted from past count and filed under $75 rate (but $75 × 0.7 is irrelevant since they pay $0 — they just get excluded)

#### Rippling Data Extraction — Still Brainstorming
- OCR from pay stub PDFs (download from Rippling dashboard)
- Browser extension to scrape the Rippling earnings page
- If Rippling ever opens an employee API, revisit

---

## 3. Spreadsheet Schema

The Google Sheet will have 4 tabs:

### Tab 1: `transactions` — Raw bank/card transactions from Plaid

| Column | Source | Notes |
|---|---|---|
| `transaction_id` | Plaid | Unique ID, use as dedup key |
| `account_id` | Plaid | Which account it came from |
| `date` | Plaid | `authorized_date` preferred |
| `name` | Plaid | Merchant/description |
| `merchant_name` | Plaid | Clean merchant name |
| `amount` | Plaid | Positive = outflow; negative = credit |
| `category` | Plaid | `personal_finance_category` |
| `payment_channel` | Plaid | in store, online, other |
| `pending` | Plaid | TRUE/FALSE |
| `currency` | Plaid | ISO code |
| `synced_at` | Auto | Timestamp of last sync |

### Tab 2: `adjustments` — Manual off-budget entries

| Column | Source | Notes |
|---|---|---|
| `id` | Auto | Row ID |
| `date` | Manual | Date of adjustment |
| `description` | Manual | e.g. "Cash spent on groceries" |
| `amount` | Manual | Positive = money in; Negative = money out |
| `category` | Manual | Cash, Refund Pending, Reimbursement, Debt, Gift, etc. |
| `status` | Manual | pending, cleared, reconciled |
| `notes` | Manual | Optional context |
| `created_at` | Auto | Timestamp |
### Tab 3: `interview_income` — Calendar-parsed interview income (Rippling replacement)

**Auto entries (read-only, from Calendar):**

| Column | Type | Source |
|---|---|---|
| `date` | Date | Calendar event start time |
| `title` | Text | Calendar event title |
| `parsed_type` | Text | $85 or $115 (parser TBD on first data inspection) |
| `status` | Text | Past / Upcoming |

**Manual overrides (user-editable):**

| Column | Type | Notes |
|---|---|---|
| `override_type` | Dropdown | $85→$115, $115→$85, No Show, No Change |
| `override_date` | Date | References the calendar event |
| `reason` | Text | Optional context |

**No-shows (manual):**

| Column | Type | Notes |
|---|---|---|
| `ns_date` | Date | When the no-show happened |
| `ns_notes` | Text | Company or context |

### Tab 4: `dashboard` — Summary & "True Available Money" Calculation

| Cell | Formula / Logic | Notes |
|---|---|---|
| **Total Bank Balance** | Sum of Plaid Balance API `available` balances across all accounts | Live from `/accounts/balance/get` — bank already factors pending holds into `available` |
| **Net Adjustments** | `=SUM(adjustments!amount)` | Sum of all manual adjustments (cash, refunds, corrections) |
| **Actual Income (Past)** | Formula counting past events × rate × 0.7, applying overrides, excluding no-shows | Locked-in interview income |
| **Potential Income** | Same as actual + upcoming events (if toggled) | Past + optionally upcoming |
| **Pending Items (info only)** | Visible in adjustments tab with "pending" status | No longer subtracted — 99% go through, so they're counted in the balance |
| **True Available Money** | `=Bank Balance + Net Adjustments + Actual Income` | **Core number** — pending is already factored in by the bank |

---

## 4. Implementation — Apps Script MVP

No long-term serverless version. Apps Script covers everything needed.

```
Plaid Link (manual, one-time setup for initial token)
   ↓
Google Apps Script (time-triggered + webhook-driven)
   ├── fetchTransactions() → calls /transactions/sync with stored cursor
   ├── appendToSheet() → writes new/changed transactions
   ├── handleWebhook() → responds to SYNC_UPDATES_AVAILABLE
   └── updateDashboard() → recalculates summary cells
   ↓
Manual: adjustments + interview counts typed directly into Sheet
```

### What Apps Script Handles
- **Scheduled fetch** — time-driven trigger every 12 hours (2x/day)
- **Balance fetch** — calls `/accounts/balance/get` for each Item, writes live balances to dashboard
- **Webhook receiver** — Plaid fires `SYNC_UPDATES_AVAILABLE` when new data lands
- **Dedup** — uses `transaction_id` as key to avoid duplicates
- **Cursor & token persistence** — 4 access_tokens + 4 cursors stored in ScriptProperties (e.g. `cursor_ally`, `access_token_chase`)
- **Calendar parser** — reads interview events via `CalendarApp`, classifies by type, writes to `interview_income` tab
- **Dashboard refresh** — recalculates after each sync

### What Remains Manual
- Adjustments tab entries (cash, refunds, corrections)
- Interview overrides (type changes, no-shows) — lightweight, only when edge cases happen

**Execution limit:** Apps Script has 6-minute cap. Fine for ~4 accounts. If we hit the limit, we can split syncs per-account.

---

## 5. Cost Summary

| Component | Cost |
|---|---|
| Google Sheets | Free |
| Google Apps Script | Free |
| Plaid Trial Plan | Free (up to 10 Items, no API call limits) |
| **Total** | **$0** |

---

## 6. Answered Open Questions

| # | Question | Decision |
|---|---|---|
| 1 | How many accounts? | 5 accounts across 4 institutions (Ally, BofA, Chase, Discover) → ~4 Plaid Items |
| 2 | Plaid dev account? | ✅ Done — signed up & approved on Trial plan |
| 3 | Rippling preference? | Manual interview income tracker (see Section 2) |
| 4 | Deployment? | Google Apps Script only |
| 5 | Sandbox first? | Yes — develop & test in Sandbox, then flip to Production |




## 7. Pre-Flight Checklist

Stuff to have ready before we start typing code. Check off as you go.

| # | Item | Who | Status |
|---|---|---|---|
| 1 | Plaid dev account on Trial plan | You | ✅ |
| 2 | Install CLASP: `pnpm install -g @google/clasp` | You | ✅ |
| 3 | `clasp login` — OAuth in browser | You | ✅ |
| 4 | Create Google Sheet named "Finance Tracker" | You | ✅ |
| 5 | `clasp create --title "Finance Tracker" --type sheets --rootDir ~/.cline/appsscript` | You | ✅ |
| 6 | Grab Plaid Sandbox `client_id` + `secret` from dashboard | You | ✅ |
| 7 | Set a dummy `redirect_uri` in Plaid Dashboard (any valid-looking URL, e.g. `https://script.google.com`) | You | ☐ |
| 8 | Create a GitHub repo named `finance-tracker` | You | ✅ |

---

## 8. Implementation Milestones

### Project Structure

```
~/.cline/appsscript/          # Git repo root
├── .gitignore                # Ignores .clasprc.json (auth tokens)
├── .clasp.json               # CLASP project config
├── appsscript.json           # Apps Script manifest (OAuth scopes declared here)
├── Debug.gs                  # Logging system — every function calls this
├── Plaid.gs                  # Plaid API: tokens, sync, balances
├── Calendar.gs               # Calendar parser for interview income
├── Dashboard.gs              # The 3 numbers + month selector
├── Manual.gs                 # Adjustments, overrides, no-shows handling
└── Tests.gs                  # Test functions — kept alongside production code
```

**Git workflow:** I write → git commit → `clasp push` → you run. You fix in the editor → `clasp pull` → git commit.

---

### I1: Foundation + Test Harness (~15 min)

**What you get:** CLASP pipeline works, Debug tab exists, we can talk to Plaid.

| Step | Who | What |
|---|---|---|
| I1.1 | **You** | Tick off Pre-Flight Checklist items 1–8 (except GitHub) |
| I1.2 | **You** | Create GitHub repo (`finance-tracker`) — public or private, your call |
| I1.3 | **Me** | Init git in `~/.cline/appsscript/`, create `.gitignore`, `.gitattributes` |
| I1.4 | **You** | `git remote add origin <repo-url>` |
| I1.5 | **Me** | Run `clasp create` → generates `.clasp.json`, `appsscript.json` — first commit + push (just config) |
| I1.6 | **Me** | Write Debug.gs — hidden "debug" tab + `log()` + `ensureDebugTab()` |
| I1.7 | **Me** | Write Tests.gs with `testDebugLogging()` — proves the log system works |
| I1.8 | **Me** | Write `testPlaidConnection()` — calls Plaid sandbox `/link/token/create`, logs full response |
| I1.9 | **Me** | Commit all code + `clasp push` |
| I1.10 | **You** | Run `testPlaidConnection()` → authorize Sheets + URL Fetch → paste Debug tab output |
| I1.11 | **Me** | Review output, confirm HTTP layer is correct, fix any issues, push fix |

**Test:** `testPlaidConnection()` returns a link_token and logs it. If it does, Plaid API works.

---

### I2: Single Account Sync (~30 min)

**What you get:** One fake bank's transactions appearing in your Sheet.

| Step | Who | What |
|---|---|---|
| I2.1 | **Me** | Write Plaid.gs — `generateSandboxToken()`, `exchangePublicToken()`, `fetchTransactions()` |
| I2.2 | **Me** | Write cursor persistence — store/retrieve cursor from ScriptProperties |
| I2.3 | **Me** | Wire to Debug tab — each API call logs request + response for review |
| I2.4 | **You** | Run `testSandboxAccountLink()` → connects a fake bank (Platypus Bank), logs the access_token |
| I2.5 | **Me** | Write seed data — run `fetchTransactions()` to pull initial batch for the linked account |
| I2.6 | **You** | Verify: transactions appear in the `transactions` tab, amounts/pending/categories look right |
| I2.7 | **You** | `git push` |

**Test:** `testSandboxAccountLink()` + `testSyncSingleItem()` — linked account's transactions are in the sheet.

---

### I3: Multi-Account + Balances (~30 min)

**What you get:** All 4 fake banks syncing with live balances.

| Step | Who | What |
|---|---|---|
| I3.1 | **Me** | Extend Plaid.gs — link remaining 3 sandbox accounts, manage 4 access_tokens + 4 cursors |
| I3.2 | **Me** | Write `fetchBalances()` — calls `/accounts/balance/get`, distinguishes credit vs debit accounts |
| I3.3 | **Me** | Write `testMultiAccountSync()` — syncs all 4, logs each cursor + error if any |
| I3.4 | **You** | Run `testMultiAccountSync()` → paste Debug tab output, check all 4 Items synced |
| I3.5 | **You** | Verify: transactions tab has data from 4 accounts, balance tab shows account types correctly |
| I3.6 | **You** | `git push` |

**Test:** `testMultiAccountSync()` — all 4 Items have cursors, balances show correct account types.

---

### I4: Webhooks — Auto-Sync (~30 min)

**What you get:** New transactions appear in the sheet automatically — no manual trigger needed.

| Step | Who | What |
|---|---|---|
| I4.1 | **Me** | Write `doPost()` webhook receiver in Debug.gs — logs raw POST body to debug tab |
| I4.2 | **Me** | Write `testWebhookDump()` — hardcoded test payload to prove receiver works |
| I4.3 | **You** | `clasp deploy` → get web app URL → authorize |
| I4.4 | **You** | Paste URL into Plaid Sandbox webhook configuration |
| I4.5 | **You** | Trigger a sandbox webhook from Plaid Dashboard → paste Debug tab output |
| I4.6 | **Me** | Confirm payload format, wire webhook to trigger `fetchTransactions()` for the correct Item |
| I4.7 | **You** | Verify: new fake transactions appear without you running anything manually |
| I4.8 | **You** | `git push` |

**Test:** Trigger a sandbox webhook → new transaction appears in sheet within 30 seconds.

---

### I5: Dashboard — The 3 Numbers (~45 min) ⭐

**What you get:** Your Actual Spend, Net Income, and Daily Budget visible in the dashboard.

| Step | Who | What |
|---|---|---|
| I5.1 | **Me** | Write Dashboard.gs — `monthSelector` cell, `updateDashboard()` function |
| I5.2 | **Me** | Write **Actual Spend** formula — sum of outflows excluding transfers (uses Plaid `personal_finance_category`) |
| I5.3 | **Me** | Write **Net Income** formula — $9,000 + interview income + manual income - spend |
| I5.4 | **Me** | Write **Daily Budget** formula — `(Net Income - target) / days_remaining` with target cell ($4,000 default) |
| I5.5 | **Me** | Add month selector — change one cell to view any month's data |
| I5.6 | **You** | Run `updateDashboard()` → authorize any remaining scopes |
| I5.7 | **You** | Verify: switch month selector, check numbers make sense with fake data |
| I5.8 | **Me** | Push fixes if formulas are off (common: credit card sign handling) |
| I5.9 | **You** | `git push` |

**Test:** Select a month with fake transactions → all 3 numbers show correct values.

---

### I6: Calendar Parser — Interview Income (~30 min)

**What you get:** Interview income auto-populates from Google Calendar.

| Step | Who | What |
|---|---|---|
| I6.1 | **Me** | Write Calendar.gs — `dumpCalendarEvents()` logs recent event titles + dates to Debug tab |
| I6.2 | **You** | Run it → authorize Calendar API → paste output |
| I6.3 | **Both** | Define parser rules based on what your actual event titles look like |
| I6.4 | **Me** | Write `parseCalendarEvents()` — classifies each event as $85 or $115, writes to `interview_income` tab |
| I6.5 | **Me** | Write override + no-show input areas into Manual.gs |
| I6.6 | **Me** | Wire interview income into Dashboard.gs — feeds Net Income |
| I6.7 | **You** | Verify: past interviews counted, upcoming appear, overrides change the numbers |
| I6.8 | **You** | `git push` |

**Test:** `dumpCalendarEvents()` renders sample events → `parseCalendarEvents()` populates interview_income tab correctly.

---

### I7: Manual Adjustments (~20 min)

**What you get:** Refunds, cash, Venmo, type corrections, no-shows all feed into the dashboard.

| Step | Who | What |
|---|---|---|
| I7.1 | **Me** | Finalize adjustments tab — ensure all manual income/expense columns work |
| I7.2 | **Me** | Wire manual + override data into Dashboard formulas |
| I7.3 | **You** | Add a few test entries (refund, Venmo deposit, interview override) |
| I7.4 | **Both** | Verify: Net Income changes correctly when you add manual income |
| I7.5 | **You** | `git push` |

**Test:** Add $100 refund → Net Income goes up by $100.

---

### I8: Production Flip (~30 min)

**What you get:** Live with your real bank accounts.

| Step | Who | What |
|---|---|---|
| I8.1 | **You** | Swap Plaid keys in ScriptProperties from Sandbox → Trial (Production) |
| I8.2 | **You** | Open Plaid Link in browser for each real account (Ally, BofA, Chase, Discover) |
| I8.3 | **Me** | Run initial full sync — pulls up to 2 years of transaction history |
| I8.4 | **You** | Update Plaid Dashboard webhook to point at production web app URL |
| I8.5 | **Both** | Verify: all 4 Items sync, balances are correct, dashboard numbers make sense with real data |
| I8.6 | **Me** | Adjust any formulas that assumed sandbox data format |
| I8.7 | **You** | `git push` with a "v1.0" tag |

**Test:** All 3 numbers in the dashboard reflect your real financial life.

---

### I9: Polish (~30 min)

**What you get:** Robustness — edge cases handled, you get emails on failure, monthly records preserved.

| Step | Who | What |
|---|---|---|
| I9.1 | **Me** | Add transaction ignore rules — filter out recurring/internal transfers from spend calculation |
| I9.2 | **Me** | Wire error notifications — `MailApp.sendEmail()` on sync failures, logged to Debug tab |
| I9.3 | **Me** | Write `generateMonthlySummary()` — snapshots month-end numbers to a summary tab |
| I9.4 | **You** | Add a few edge-case transactions, verify ignore rules work |
| I9.5 | **You** | `git push` final version |

**Test:** Simulate a Plaid API error → email arrives with the Debug tab output attached.

---

### Testing Strategy Summary

| Layer | How we validate | Example |
|---|---|---|
| **Config/plumbing** | Test function per integration point | `testPlaidConnection()` validates HTTP + auth in one run |
| **Data format** | Debug tab dumps raw API output for review | First sync logs every field Plaid returns |
| **Business logic** | Verify with fake data before production | I5 tested with sandbox data before I8 goes live |
| **Dashboard formulas** | Change a cell, see the number update | Add $100 refund, Net Income goes up by $100 |
| **End-to-end** | `clasp push` → run → check Debug tab → fix → re-push | Standard cycle for every iteration |
