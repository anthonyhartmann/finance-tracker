# Migration Handoff Brief

## Goal
Migrate the Google Apps Script finance tracker to TypeScript/Node.js while keeping the **same Google Spreadsheet** as the UI/database.

## What's Done (12 files, ~1,400 lines)

| File | Status | Notes |
|---|---|---|
| `src/types.ts` | ✅ Done | Shared interfaces (SyncResult, PlaidTransaction, etc.) |
| `src/config.ts` | ✅ Done | Replaces PropertiesService; JSON file + env var fallback |
| `src/google-auth.ts` | ✅ Done | OAuth 2.0 + Service Account support for Google APIs |
| `src/sheet-api.ts` | ✅ Done | Wraps Google Sheets API v4 (replaces SpreadsheetApp) |
| `src/debug.ts` | ✅ Done | Logs to console + appends to `debug` tab in sheet |
| `src/plaid.ts` | ✅ Done | Full Plaid API client (tokens, sync, balances, webhooks) |
| `src/sheet-ops.ts` | ✅ Done | Write transactions/balances to sheet tabs |
| `src/sync.ts` | ✅ Done | `syncProductionAccount`, `syncAllProductionAccounts`, `resetAndResync` |
| `src/dashboard.ts` | ✅ Done | `init`, `refresh`, `calculateSpend`, `calculateInterviewIncome`, `calculateManualAdjustments`, `refreshAll` |
| `src/calendar.ts` | ✅ Done | Google Calendar API integration; `parseCalendarEvents`, `dumpCalendarEvents` |
| `src/recurring.ts` | ✅ Done | Upcoming bills calculation from `recurring` tab |
| `src/manual.ts` | ✅ Done | Manual adjustments tab operations |

## What's Missing

| File | Priority | Notes |
|---|---|---|
| `src/savings.ts` | 🔴 High | Complex — fetches bank + investment transactions, builds savings tracker tab. Original is ~250 lines in Savings.gs. |
| `src/snapshot.ts` | 🟡 Medium | Copies tabs month-end. Straightforward. |
| `src/server.ts` | 🟡 Medium | Express server to replace `doPost`/`doGet` webhooks. Needs webhook handler + maybe a simple dashboard UI. |
| `src/index.ts` | 🟡 Medium | CLI entry point / cron runner. |
| `src/tests.ts` | 🟢 Low | Test suite mirroring Tests.gs. |
| `src/link.ts` | 🟡 Medium | Plaid Link token generation + exchange. Was Link.gs. |
| `src/setup.ts` | 🟢 Low | One-time setup helpers (store Plaid creds). Was Setup.gs. |

## Architecture

- **Runtime:** Node 18+ (uses native `fetch`)
- **Build:** `tsc` compiles `src/` → `dist/`
- **Auth:** `.env` for secrets; `local-config.json` for runtime state (cursors, tokens)
- **Google Auth:** OAuth 2.0 flow via `ts-node src/google-auth.ts` OR service account JSON
- **Sheet ID:** Set `SPREADSHEET_ID` in `.env`

## Key Patterns

1. **All sheet reads/writes are async** — every function that touches the sheet returns a Promise.
2. **Debug module is async** — `await Debug.log()` everywhere.
3. **Circular deps avoided** — dashboard uses dynamic `import()` for sync/savings to break cycles.
4. **Apps Script → Node mappings:**
   - `SpreadsheetApp` → `sheet-api.ts` / `sheet-ops.ts`
   - `PropertiesService` → `config.ts`
   - `UrlFetchApp.fetch` → native `fetch`
   - `CalendarApp` → `googleapis` Calendar API
   - `Utilities.formatDate` → `toLocaleDateString('en-CA', { timeZone })`
   - `ScriptApp.getProjectTriggers` → `node-cron` or system cron

## How to Continue

```bash
cd /Users/anthonyhartmann/.cline/ts-app
npm install
# Add .env with SPREADSHEET_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, etc.
npx ts-node src/google-auth.ts   # one-time OAuth
cp .env.example .env             # then fill it in
npm run build
```

## Next Agent Should Probably

1. **Implement `src/savings.ts`** — this is the biggest remaining piece. Reference `/Users/anthonyhartmann/.cline/appsscript/Savings.gs`.
2. **Implement `src/server.ts`** — Express app with `/webhook` POST handler (replaces Webhook.gs) and static dashboard.
3. **Create `src/index.ts`** — CLI to run individual commands (`sync`, `refresh`, etc.).
4. **Wire up `package.json` scripts** to actually work.
5. **Compile and fix any TypeScript errors** — haven't tried `tsc` yet; expect a few.

## Known Gotchas

- `sheet-api.ts` uses `googleapis` with `valueRenderOption: 'UNFORMATTED_VALUE'` — formulas come back as computed values, which is what we want for reads.
- `dashboard.ts` reads formulas like `=SUM(...)` as numbers because of the above; this matches Apps Script behavior.
- The `debug` tab is created automatically on first log; no need to pre-create.
- `SHEET.ensureTab` in `sheet-ops.ts` shadows `sheetApi.ensureTab` — naming is slightly inconsistent but functional.
