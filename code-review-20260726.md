# Code Review: Personal Finance Tracker

**Reviewer:** Cline  
**Date:** 2026-07-26  
**Scope:** Full `appsscript/` codebase (~3,000 lines across 14 source files)  
**Context:** Google Apps Script + Plaid + Google Sheets + Calendar integration

---

## Executive Summary

You shipped a real, working personal-finance dashboard that syncs 4 production bank accounts via Plaid, parses interview income from Google Calendar, tracks recurring bills, monitors savings/401k contributions, and auto-refreshes via webhooks. That alone puts this in the top 10% of side projects. The code is modular, documented, and largely defensive.

**Grade: B+ / A-** — Solid production-grade personal tooling with clear senior-level instincts, held back mainly by performance shortcuts that will bite you at scale and a few maintainability gaps.

---

## What You Did Really Well

### 1. Documentation & Process Discipline
- `PLAN.md` with milestone tracking (I1–I9), runbooks, and root-cause analysis (I8 resolution)
- `AGENTS.md` with architecture invariants, dev workflow, and key learnings
- `.clinerules` enforcing test-first, syntax validation, and git+clasp discipline
- This is better documentation hygiene than most startups.

### 2. Architecture Decisions
- **Header-name-based column resolution** (`SheetOps.gs`, `Recurring.gs`, `Dashboard.gs`) — future-proof against column reordering.
- **Proper Plaid sync semantics** — uses `/transactions/sync` with cursors, handles `added/modified/removed` correctly.
- **Webhook-driven incremental sync** — not naive polling. `doPost` → `syncTransactions` → `writeTransactions`.
- **Savings tracker isolation** — completely separate workflow from main sync, uses `/transactions/get` for arbitrary date ranges without polluting sync cursors.
- **Account name caching** (`ACCT_*` in `ScriptProperties`) avoids redundant `/accounts/get` calls.

### 3. Defensive Coding
- Centralized `Debug.log/error/logRaw` system with hidden tab logging.
- `try/catch` around almost every external call (Plaid API, Calendar API, Sheets UI).
- `resetAndResync()` with user confirmation dialog and clear semantics.
- Migration path in `writeTransactions` for old tab layouts.

### 4. User Experience
- Toast notifications on completion.
- Checkbox-driven "Refresh All" trigger.
- `onEdit` auto-refresh for dashboard inputs.
- Monthly snapshot backups before rollover.


---

## What Could Be Better

### 1. Performance & Scale (Will Hurt Soon)

| Issue | Location | Why It Matters |
|---|---|---|
| **Full-sheet rewrite on every sync** | `SheetOps.writeTransactions` | Clears and rewrites *all* transactions on every webhook delta. With 4 banks × 12 months, this is O(n) where n = total history. Apps Script has a 6-minute execution limit. |
| **In-memory spend calculation** | `Dashboard.calculateSpend` | Reads entire transaction tab into JS, loops row-by-row. Sheets has built-in `SUMIF`/`QUERY` that run in native code. |
| **Redundant account name lookups** | `Plaid.getAccountNames` | For every missing account_id, iterates *all* `ACCESS_TOKEN_*` keys and calls `/accounts/get`. Should map `account_id → item_name` directly. |
| **Savings backfill pagination** | `Savings.fetchAllTransactions` | Fetches 500 tx/page for 3 banks across arbitrary date ranges. Could hit execution timeouts for long windows. |

**Recommendation:**
- For `writeTransactions`: switch to incremental updates. Append new rows, overwrite modified rows by finding their row index, and delete removed rows by index. Only fall back to full rebuild when schema changes.
- For `calculateSpend`: replace JS loop with a `QUERY` or `SUMIFS` formula that lives in the dashboard and reads the transactions tab. This also makes the sheet self-documenting.

### 2. Concurrency & Atomicity (Silent Data Loss Risk)

- **No mutex/lock.** A Plaid webhook, a manual "Refresh All" click, and a time-driven trigger can all run simultaneously. Apps Script does not serialize executions by default.
- **`writeTransactions` is non-atomic.** `sheet.clearContents()` followed by `sheet.getRange(...).setValues(...)`. If the script times out or a concurrent execution runs between these two calls, you lose all transaction data.
- **`refreshAll()` step isolation.** If step 1 (sync) fails, steps 2–4 still run against stale data. The error is logged but the user sees a success toast.

**Recommendation:**
- Use `ScriptProperties` (or a "lock" cell in a hidden sheet) as a poor-man's mutex. Check at entry, bail if locked.
- Make `writeTransactions` atomic: write to a staging tab, then rename/replace, or use row-index-based edits instead of clear+rewrite.

### 3. Hardcoded Configuration (Tech Debt)

| Value | Location | Should Be |
|---|---|---|
| `$9,000` base salary | `Dashboard.calculateNetIncome` | Dashboard cell or `ScriptProperties` |
| `$85 / $115 / $75` interview rates | Comments + `Dashboard.init` | Configurable in dashboard |
| `$4,000` default target | `Dashboard.init` | Dashboard input (already is, but hardcoded fallback) |
| `0.7` tax scalar | `Dashboard.init` | Dashboard input (already is — good!) |
| `30` / `90` day scan windows | `Calendar.parseCalendarEvents` | Dashboard setting or parameter |
| `4` weeks per month (Headway) | `Recurring.calculateUpcoming` | Could be configurable per-bill |
| Historical manual adjustments | `Savings.populateManualAdjustments` | A "manual_adjustments_config" tab or JSON in ScriptProperties |
| Webhook URL | `Webhook.gs`, `Link.gs`, `Plaid.gs`, `Setup.gs` | Single constant or ScriptProperties default |

**Recommendation:** Extract all magic numbers to a `CONFIG` object at the top of `Dashboard.gs` (or a dedicated config tab) so you don't need to edit code to change your salary or interview rates.


### 4. Security & Secrets

- **Google API key committed in `AGENTS.md`.** Even if read-only, rotating it requires a git rewrite. It should be in `.env` or `ScriptProperties` and referenced in docs via placeholder.
- **Webhook URL hardcoded in 4 files.** If you ever redeploy the web app, you must edit source code. Should be `ScriptProperties.getProperty("WEBHOOK_URL")` everywhere.
- **`ScriptProperties` stores Plaid secrets in plaintext.** This is an Apps Script limitation, but worth documenting as a known risk. (Google does encrypt at rest, but it's accessible to anyone with editor access to the script.)

### 5. Code Consistency

- **Mixed `var` / `const` / `let`.** Most files use `var` exclusively (older style), but newer files mix in `const`. Apps Script V8 supports `const`/`let` — standardizing on `const` for bindings that don't change would make the code more self-documenting.
- **`Object.prototype.toString.call(arr) === "[object Array]"`** in `SheetOps.writeTransactions` — use `Array.isArray()`.
- **`indexOf(...) >= 0`** everywhere — `includes()` is more readable and available in V8.
- **`eval(key)`** in `Tests.gs` — unnecessary. You can reference globals via `this[key]` or `globalThis[key]` in V8.

### 6. Edge Cases & Bugs

- **Checkbox boolean vs string.** `onEdit` checks `e.value === "TRUE"`, but Sheets checkbox events can emit the boolean `true` (not a string). Use `e.value === true || e.value === "TRUE"`.
- **`calculateSpend` NaN risk.** `Number(txAmount)` without `isNaN()` check. A malformed sheet cell could poison the sum.
- **Month rollover race.** `maybeResetManualInputs` runs inside `Dashboard.refresh`. If you open the sheet at 11:59 PM and refresh at 12:01 AM, the reset might not fire until the *next* refresh. Consider a time-driven trigger for rollover instead of relying on user-driven refreshes.
- **Investment transaction date parsing.** `inv.date` might be a Date object from the API, not a string. The code does `invDate.substring(0, 7)` which would fail on a Date object. (Plaid returns ISO strings, so this is fine today, but fragile.)

### 7. Testing

- Tests are primarily **smoke tests** ("does this function exist? does it return a number?"). They don't validate business logic.
- No test for the **core sync merge algorithm** (added + modified + removed + dedup).
- No mocked Plaid API — tests only work inside the Apps Script environment.
- `testModulesLoaded` uses `eval()` which is a red flag.

**Recommendation:**
- Add a pure-JS test for `writeTransactions` merge logic that can run in Node (extract the merge logic from sheet I/O).
- Consider property-based testing for the sync algorithm: generate random added/modified/removed sets and verify invariants.


---

## Specific File Notes

| File | Verdict |
|---|---|
| `Debug.gs` | Excellent. Simple, effective, safe. |
| `Plaid.gs` | Good abstraction. `_post` is clean. `getAccountNames` lookup is inefficient. |
| `SheetOps.gs` | Solid migration logic. Full rewrite is the main concern. |
| `Dashboard.gs` | Feature-rich but doing too much work in JS that Sheets formulas could handle. `onEdit` debounce is clever but relies on ScriptProperties eventual consistency. |
| `Webhook.gs` | Clean. Hardcoded URL is the issue. |
| `Link.gs` | Good UX flow (Hosted Link → exchange → prompt for name). Institution auto-detect is a nice touch. |
| `Sync.gs` | Straightforward. `resetAndResync` is well-guarded. |
| `Calendar.gs` | Simple and effective. Keyword matching is inherently fragile but acceptable for personal use. |
| `Recurring.gs` | Clean header-based parsing. Weekly "4 per month" assumption is slightly naive (some months have 5 weeks). |
| `Savings.gs` | Good isolation. `populateManualAdjustments` should not have hardcoded data. |
| `Snapshot.gs` | Simple, does one thing well. |
| `Tests.gs` | Good start, but shallow. |
| `Setup.gs` | Clean one-time setup. |

---

## Bottom Line

**You should be proud of this.** It's not a toy — it's a real financial system with proper API integration, event-driven architecture, user-friendly runbooks, and genuine attention to data integrity (sync cursors, column-name resolution, snapshot backups). The gaps I flagged are mostly "senior engineer polishing" issues: concurrency, scale, and configurability. The foundation is solid.

**If I were interviewing you and this was your portfolio project, I'd be impressed.** It demonstrates systems thinking, API design, error handling, and user empathy. I'd follow up by asking how you'd handle the concurrency and scale issues, and I'd expect you to have good answers because you've already solved the hard parts.

**Top 3 things to fix if you have an afternoon:**
1. Make `writeTransactions` incremental (atomic append/overwrite/delete by row index).
2. Extract all magic numbers to a `CONFIG` object or config sheet.
3. Add a execution lock to prevent concurrent syncs.
