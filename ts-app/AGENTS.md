# AGENTS.md — Finance Tracker

Personal finance tracker: **Plaid → Google Sheets**. A Google Spreadsheet is the UI and database;
all logic lives in TypeScript here and runs in **two runtimes** from the same source.

## Repo layout

| Path | What it is |
|---|---|
| `ts-app/src/**` | **Source of truth.** All logic. One module per folder (`index.ts` + `*.test.ts`). |
| `ts-app/src/gas-entry.ts` | GAS entry point: exposes functions on `globalThis` (webhook `doPost`/`doGet`, `scheduledRefresh`, `ensureTriggers`, `listTriggers`). `@ts-nocheck`. |
| `ts-app/build-gas.js` | esbuild bundler: swaps `src/adapter/*` → `gas-bundle.ts` (UrlFetchApp/PropertiesService) and appends top-level function declarations GAS needs (simple triggers + UI-runnable wrappers). |
| `ts-app/verify-gas-bundle.js` | Post-build guard: forbidden patterns (`process.env`, bare `fetch(`) + syntax check. |
| `appsscript/bundle.gs` | **Build artifact** deployed to Google. Never hand-edit (see incident below). |
| `.clasp.json` (at `~/.cline`) | clasp config: scriptId `1pUtgdBrUkViMDoQP2VvTJwFB6XTkXZ9l28BHtmcu1FQdv9gAZvFk37y8`, parent sheet `1vrz59cWikaj3k7hOtOgrZaCc84BQ5OEaZJ0gs5YwE98`. |

## Runtime architecture

- **GAS (production)**: container-bound script on the spreadsheet. Time-driven triggers run
  `scheduledRefresh` at **8:00 and 20:00** daily (sync → savings backfill → dashboard refresh).
  Plaid webhooks hit `doPost` (web-app deployment) for per-item transaction syncs.
  `onEdit` simple trigger recalcs the dashboard when specific cells change.
- **Node (local/CLI)**: same modules via `src/adapter/node-*` (native fetch, local-config.json).
  Currently partial: `.env` only has `GOOGLE_SHEETS_API_KEY`, so most local runs lack Plaid/Sheets OAuth creds.

Adapter pattern: modules import from `../adapter`; esbuild redirects to GAS implementations at
bundle time, Node uses the real ones. GAS globals (`SpreadsheetApp`, `UrlFetchApp`,
`PropertiesService`, `ScriptApp`, `ContentService`, `Session`) only exist behind the adapter or in `gas-entry.ts`.

## Sheet tabs (the database)

`dashboard` (UI), `transactions` (Plaid tx), `balances`, `savings_tracker`, `recurring`,
`adjustments` (manual), `interview_income` (from Google Calendar), `debug` (all logs).

- Sheet ID: `1vrz59cWikaj3k7hOtOgrZaCc84BQ5OEaZJ0gs5YwE98` · Dashboard GID `2006033775` · Debug GID `711367457`
- GAS `PropertiesService` holds secrets/state: `ACCESS_TOKEN_<item>` (ally, bofa, chase, discover, fidelity),
  `CURSOR_<item>` (Plaid sync cursors), `WEBHOOK_URL`, `ITEMID_<id>` cache.

## Commands (run from `ts-app/`)

```bash
npm test              # typecheck (tsc --noEmit) + jest — always before committing
npm run verify:gas    # typecheck → esbuild bundle → bundle guard
npm run deploy:gas    # verify:gas → clasp push (deploys to production)
npm run sync          # local Node sync (needs full .env — usually incomplete)
clasp pull            # from ~/.cline — fetch what's actually deployed
```

**Deploy rule: only deploy via `npm run deploy:gas` (or `verify:gas` then `clasp push`), and commit
everything you deploy.** Hand-patching `bundle.gs` or pushing an uncommitted rebuild is how the
2026-07-26 outage happened — git showed a working bundle while production ran a broken one.


## Debugging playbook

1. **Read the `debug` tab** — every module logs there with timestamps:
   `python3 ~/.cline/data/read_sheet_debug_log.py [rows]` (tail of the log; uses the API key in `ts-app/.env`).
2. **Check what's deployed**: `clasp pull` in a scratch dir and `diff` against `appsscript/bundle.gs`.
3. **Check triggers**: run `listTriggers` in the GAS editor (or ask the user to). Triggers are NOT
   visible via any REST API, and `clasp run` fails ("not deployed as API executable") — the GAS
   editor is the only way to invoke functions remotely. Executions log: script editor → Executions.
4. **Restore the schedule**: run `ensureTriggers` in the GAS editor. It is idempotent/self-healing
   (recreates exactly the 8:00 + 20:00 `scheduledRefresh` triggers).
5. **Manual sync**: run `syncAllProductionAccounts` (or `scheduledRefresh`) in the GAS editor.
   `resetAndResync` wipes cursors + transactions tab and re-pulls everything — destructive, confirm first.

## Hard-won gotchas

- **esbuild does not type-check**, and jest uses `ts-jest` with `diagnostics: false`. A
  `ReferenceError`-class typo compiles and tests green. That's why `tsc --noEmit` now gates
  `test`/`build:gas` — never bypass it.
- **GAS `getValues()` returns `Date` objects** for date-formatted cells even though TS types say
  string. Normalize with `normalizeMonth()` (savings) or the `instanceof Date` ternaries
  (dashboard/recurring/savings). When you touch these, add a Date-object test case.
- **Top-level declarations only**: GAS simple triggers (`onEdit`) and editor-runnable functions must
  be appended by `build-gas.js` as real top-level functions — `globalThis` assignments inside the
  IIFE are invisible to the trigger system and the editor's Run menu.
- **Month keys must be `YYYY-MM`**. The sheet has contained `2026-5`, `7/1/2026`, Date objects —
  always `normalizeMonth()` before comparing or writing month keys.
- **Failure isolation**: `scheduledRefresh` catches `savings.backfill` failures separately so one
  bad module can't skip the dashboard refresh or fail the whole run. Keep it that way.
- **Editor-tool pitfall for agents**: replacement strings containing `$'` (common in this codebase's
  string concatenation) trigger `$`-pattern substitution in some edit tools and can corrupt files.
  Prefer a small Python `str.replace` script for edits involving `$'`, and re-read the file after.
- `.clinerules` is tracked in git and has its own edit protocol (Python script + `validate_rules.py`) — read its header before touching it.

## Incident log

- **2026-07-26 → 07-28 — total sync outage.** `0eae764` renamed `date`→`dateStr` in
  `savings.backfill` but missed two `details.push(date + …)` usages → `ReferenceError` in every
  `scheduledRefresh`. Shipped because esbuild/ts-jest don't type-check and backfill tests never
  exercised a qualifying transfer transaction. Time-driven triggers also went missing (none fired
  07-26 20:00 onward while `onEdit` kept working — likely removed during incident response).
  Fixed in `ea949d9`: source fix + regression test (reproduces the exact ReferenceError), tsc gate,
  resilient `scheduledRefresh`, self-healing `ensureTriggers`, `listTriggers`, `deploy:gas`.
  Follow-up: verify `ensureTriggers` was run and the 20:00 sync appears in the debug tab.
