"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/adapter/gas-sheet.ts
  function ss() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
  var gasSheet;
  var init_gas_sheet = __esm({
    "src/adapter/gas-sheet.ts"() {
      "use strict";
      gasSheet = {
        ensureTab(tabName, headers) {
          const s = ss();
          let sheet = s.getSheetByName(tabName);
          if (!sheet) {
            sheet = s.insertSheet(tabName);
            sheet.appendRow(headers);
            sheet.setFrozenRows(1);
            console.log("Created tab: " + tabName);
          }
          return Promise.resolve(tabName);
        },
        getValues(tabName, range) {
          const s = ss();
          const sheet = s.getSheetByName(tabName);
          if (!sheet) return Promise.resolve([]);
          if (range) {
            return Promise.resolve(sheet.getRange(range).getValues());
          }
          return Promise.resolve(sheet.getDataRange().getValues());
        },
        appendRow(tabName, row) {
          const s = ss();
          let sheet = s.getSheetByName(tabName);
          if (!sheet) sheet = s.insertSheet(tabName);
          sheet.appendRow(row);
          return Promise.resolve();
        },
        setValues(rangeExpr, values) {
          const parts = rangeExpr.split("!");
          const tabName = parts[0];
          const a1 = parts[1] || "A1";
          const s = ss();
          let sheet = s.getSheetByName(tabName);
          if (!sheet) sheet = s.insertSheet(tabName);
          if (values.length === 0) return Promise.resolve();
          const numRows = values.length;
          const numCols = values[0].length;
          const match = a1.match(/^([A-Z]+)(\d+)$/);
          if (!match) {
            throw new Error("Invalid range format: " + a1);
          }
          const startColStr = match[1];
          const startRow = parseInt(match[2], 10);
          let startCol = 0;
          for (let i = 0; i < startColStr.length; i++) {
            startCol = startCol * 26 + (startColStr.charCodeAt(i) - 64);
          }
          const endCol = startCol + numCols - 1;
          const endRow = startRow + numRows - 1;
          let endColStr = "";
          let col = endCol;
          while (col > 0) {
            const mod = (col - 1) % 26;
            endColStr = String.fromCharCode(65 + mod) + endColStr;
            col = Math.floor((col - 1) / 26);
          }
          const range = sheet.getRange(startRow, startCol, numRows, numCols);
          range.setValues(values);
          return Promise.resolve();
        },
        clearTab(tabName, keepHeaders) {
          const s = ss();
          const sheet = s.getSheetByName(tabName);
          if (!sheet) return Promise.resolve();
          if (keepHeaders) {
            const data = sheet.getDataRange().getValues();
            if (data.length <= 1) return Promise.resolve();
            sheet.getRange(2, 1, data.length - 1, data[0].length).clearContent();
          } else {
            sheet.clearContents();
          }
          return Promise.resolve();
        },
        getCell(tabName, a1) {
          const s = ss();
          const sheet = s.getSheetByName(tabName);
          if (!sheet) return Promise.resolve(void 0);
          return Promise.resolve(sheet.getRange(a1).getValue());
        },
        setCell(tabName, a1, value) {
          const s = ss();
          let sheet = s.getSheetByName(tabName);
          if (!sheet) sheet = s.insertSheet(tabName);
          sheet.getRange(a1).setValue(value);
          return Promise.resolve();
        },
        copySheet(sourceName, destName) {
          const s = ss();
          const src = s.getSheetByName(sourceName);
          if (!src) {
            console.log('Source sheet "' + sourceName + '" not found');
            return Promise.resolve(null);
          }
          const existing = s.getSheetByName(destName);
          if (existing) s.deleteSheet(existing);
          const copy = src.copyTo(s);
          copy.setName(destName);
          console.log('Copied sheet "' + sourceName + '" -> "' + destName + '"');
          return Promise.resolve(1);
        },
        deleteSheet(tabName) {
          const s = ss();
          const sheet = s.getSheetByName(tabName);
          if (sheet) s.deleteSheet(sheet);
          return Promise.resolve();
        },
        renameSheet(oldName, newName) {
          const s = ss();
          const sheet = s.getSheetByName(oldName);
          if (sheet) sheet.setName(newName);
          return Promise.resolve();
        }
      };
    }
  });

  // src/adapter/gas-config.ts
  var gasConfig;
  var init_gas_config = __esm({
    "src/adapter/gas-config.ts"() {
      "use strict";
      gasConfig = {
        getProperty(key) {
          return PropertiesService.getScriptProperties().getProperty(key);
        },
        setProperty(key, value) {
          PropertiesService.getScriptProperties().setProperty(key, value);
        },
        deleteProperty(key) {
          PropertiesService.getScriptProperties().deleteProperty(key);
        },
        getKeys() {
          return PropertiesService.getScriptProperties().getKeys();
        }
      };
    }
  });

  // src/adapter/gas-calendar.ts
  var gasCalendar;
  var init_gas_calendar = __esm({
    "src/adapter/gas-calendar.ts"() {
      "use strict";
      gasCalendar = {
        getCalendarId() {
          return PropertiesService.getScriptProperties().getProperty("CALENDAR_ID") || "primary";
        },
        listEvents(daysBack, daysForward) {
          const props = PropertiesService.getScriptProperties();
          const calId = props.getProperty("CALENDAR_ID") || "primary";
          const cal = calId === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
          if (!cal) return Promise.resolve([]);
          const now = /* @__PURE__ */ new Date();
          const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1e3);
          const end = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1e3);
          const events = cal.getEvents(start, end);
          return Promise.resolve(events.map((e) => ({
            summary: e.getTitle(),
            description: e.getDescription(),
            startDate: e.getStartTime()
          })));
        }
      };
    }
  });

  // src/adapter/gas-http.ts
  var gasHttp;
  var init_gas_http = __esm({
    "src/adapter/gas-http.ts"() {
      "use strict";
      gasHttp = {
        postJson(url, body) {
          let response;
          try {
            response = UrlFetchApp.fetch(url, {
              method: "post",
              contentType: "application/json",
              payload: JSON.stringify(body),
              muteHttpExceptions: true
            });
          } catch (e) {
            throw new Error("UrlFetchApp.fetch failed for " + url + ": " + (e instanceof Error ? e.message : String(e)));
          }
          const code = response.getResponseCode();
          const text = response.getContentText();
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            data = { raw: text };
          }
          return Promise.resolve({ status: code, data });
        }
      };
    }
  });

  // src/adapter/gas-bundle.ts
  var init_gas_bundle = __esm({
    "src/adapter/gas-bundle.ts"() {
      init_gas_sheet();
      init_gas_config();
      init_gas_calendar();
      init_gas_http();
    }
  });

  // src/sheet-api/index.ts
  var ensureTab, getValues, appendRow, setValues, clearTab, getCell, setCell, copySheet, deleteSheet, renameSheet;
  var init_sheet_api = __esm({
    "src/sheet-api/index.ts"() {
      "use strict";
      init_gas_bundle();
      ensureTab = gasSheet.ensureTab.bind(gasSheet);
      getValues = gasSheet.getValues.bind(gasSheet);
      appendRow = gasSheet.appendRow.bind(gasSheet);
      setValues = gasSheet.setValues.bind(gasSheet);
      clearTab = gasSheet.clearTab.bind(gasSheet);
      getCell = gasSheet.getCell.bind(gasSheet);
      setCell = gasSheet.setCell.bind(gasSheet);
      copySheet = gasSheet.copySheet.bind(gasSheet);
      deleteSheet = gasSheet.deleteSheet.bind(gasSheet);
      renameSheet = gasSheet.renameSheet.bind(gasSheet);
    }
  });

  // src/runtime.ts
  function getTimezone() {
    try {
      if (typeof Session !== "undefined" && Session.getScriptTimeZone) {
        const tz = Session.getScriptTimeZone();
        if (tz) return tz;
      }
    } catch {
    }
    try {
      if (typeof process !== "undefined" && process.env && process.env.TIMEZONE) {
        return process.env.TIMEZONE;
      }
    } catch {
    }
    return "America/New_York";
  }
  function formatDateCell(rawDate, tz) {
    if (!rawDate) return "";
    const zone = tz || getTimezone();
    if (rawDate instanceof Date) {
      return rawDate.toLocaleDateString("en-CA", { timeZone: zone });
    }
    const s = String(rawDate).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      if (s.includes("T")) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("en-CA", { timeZone: zone });
        }
      }
      return s.substring(0, 10);
    }
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const mo = Number(m[1]);
      const da = Number(m[2]);
      const y = m[3];
      return y + "-" + (mo < 10 ? "0" + mo : String(mo)) + "-" + (da < 10 ? "0" + da : String(da));
    }
    return s;
  }
  var init_runtime = __esm({
    "src/runtime.ts"() {
      "use strict";
    }
  });

  // src/debug/index.ts
  function getTimestamp() {
    const now = /* @__PURE__ */ new Date();
    const tz = getTimezone();
    return now.toLocaleString("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).replace(/\//g, "-");
  }
  async function ensureTab2() {
    try {
      await ensureTab(SHEET_NAME, ["timestamp", "function", "message"]);
    } catch {
    }
  }
  async function rotateLog() {
    try {
      const data = await getValues(SHEET_NAME);
      if (!data || data.length <= MAX_DEBUG_ROWS) return;
      const headers = data[0];
      const tail = data.slice(data.length - (MAX_DEBUG_ROWS - 1));
      const trimmed = [headers, ...tail];
      await clearTab(SHEET_NAME, false);
      await setValues(`${SHEET_NAME}!A1`, trimmed);
    } catch {
    }
  }
  async function log(fn, message) {
    const timestamp = getTimestamp();
    let safeMessage = String(message);
    while (safeMessage.startsWith("=")) {
      safeMessage = safeMessage.substring(1);
    }
    console.log(`[${fn}] ${message}`);
    try {
      await appendRow(SHEET_NAME, [timestamp, fn, safeMessage]);
      await rotateLog();
    } catch {
    }
  }
  async function logRaw(fn, data) {
    const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    await log(fn, json);
  }
  async function error(fn, err) {
    const msg = err && err.message ? err.message : String(err);
    await log(fn, `ERROR: ${msg}`);
    if (err && err.stack) {
      await log(fn, `STACK: ${err.stack}`);
    }
    console.error(`[${fn}] ${msg}`);
  }
  var SHEET_NAME, MAX_DEBUG_ROWS;
  var init_debug = __esm({
    "src/debug/index.ts"() {
      "use strict";
      init_sheet_api();
      init_runtime();
      SHEET_NAME = "debug";
      MAX_DEBUG_ROWS = 1e3;
    }
  });

  // src/config/index.ts
  var getProperty, setProperty, deleteProperty, getKeys;
  var init_config = __esm({
    "src/config/index.ts"() {
      "use strict";
      init_gas_bundle();
      getProperty = gasConfig.getProperty.bind(gasConfig);
      setProperty = gasConfig.setProperty.bind(gasConfig);
      deleteProperty = gasConfig.deleteProperty.bind(gasConfig);
      getKeys = gasConfig.getKeys.bind(gasConfig);
    }
  });

  // src/plaid/index.ts
  function getSyncStartDate() {
    return getProperty("SYNC_START_DATE") || "2026-07-01";
  }
  function baseUrl() {
    const env = getProperty("PLAID_ENVIRONMENT") || "sandbox";
    return env === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
  }
  function creds() {
    return {
      client_id: getProperty("PLAID_CLIENT_ID"),
      secret: getProperty("PLAID_SECRET")
    };
  }
  async function post(endpoint, payload) {
    const c = creds();
    const body = { ...payload, client_id: c.client_id, secret: c.secret };
    const url = baseUrl() + endpoint;
    await log("Plaid._post", "POST " + url);
    const { status, data } = await gasHttp.postJson(url, body);
    await log("Plaid._post", "Response: " + status);
    const result = data;
    if (result.error_type) {
      await log("Plaid._post", "ERROR: " + result.error_type + " - " + result.error_message);
      throw new Error(result.error_type + ": " + result.error_message);
    }
    return result;
  }
  function getAccessToken(itemName) {
    return getProperty("ACCESS_TOKEN_" + itemName);
  }
  async function syncTransactions(itemName) {
    await log("Plaid.syncTransactions", "Starting sync for: " + itemName);
    const accessToken = getAccessToken(itemName);
    if (!accessToken) {
      throw new Error("No access token found for: " + itemName);
    }
    const cursorKey = "CURSOR_" + itemName;
    let cursor = getProperty(cursorKey) || "";
    const result = { added: [], modified: [], removed: [] };
    let hasMore = true;
    let skippedOld = 0;
    const syncStartDate = getSyncStartDate();
    while (hasMore) {
      const data = await post("/transactions/sync", {
        access_token: accessToken,
        cursor,
        count: 100
      });
      for (const t of data.added || []) {
        if (syncStartDate && t.date && t.date < syncStartDate) {
          skippedOld++;
          continue;
        }
        result.added.push(t);
      }
      for (const t of data.modified || []) {
        if (syncStartDate && t.date && t.date < syncStartDate) {
          skippedOld++;
          continue;
        }
        result.modified.push(t);
      }
      for (const t of data.removed || []) {
        result.removed.push(t);
      }
      cursor = data.next_cursor || "";
      hasMore = data.has_more || false;
    }
    setProperty(cursorKey, cursor);
    const repairedCursor = await validateAndRepairCursor(itemName, accessToken, cursorKey, syncStartDate, result);
    const totalChanges = result.added.length + result.modified.length + result.removed.length;
    if (totalChanges === 0 && !repairedCursor) {
      const lastRefreshKey = "LAST_REFRESH_" + itemName;
      const lastRefresh = getProperty(lastRefreshKey) || "";
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1e3).toISOString();
      if (!lastRefresh || lastRefresh < sixHoursAgo) {
        try {
          await post("/transactions/refresh", { access_token: accessToken });
          setProperty(lastRefreshKey, (/* @__PURE__ */ new Date()).toISOString());
          await log("Plaid.transactionsRefresh", itemName + ": forced refresh \u2014 item returned 0 changes");
        } catch (e) {
          await error("Plaid.transactionsRefresh", itemName + " refresh failed: " + (e instanceof Error ? e.message : String(e)));
        }
      }
    }
    await log("Plaid.syncTransactions", itemName + ": " + result.added.length + " new, " + result.modified.length + " updated, " + result.removed.length + " removed (" + skippedOld + " old skipped, before " + syncStartDate + ")");
    return result;
  }
  async function validateAndRepairCursor(itemName, accessToken, cursorKey, syncStartDate, result) {
    const seenIds = /* @__PURE__ */ new Set();
    for (const t of result.added) seenIds.add(String(t.transaction_id));
    for (const t of result.modified) seenIds.add(String(t.transaction_id));
    const tz = "America/New_York";
    const today = /* @__PURE__ */ new Date();
    const windowEnd = today.toLocaleDateString("en-CA", { timeZone: tz });
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1e3);
    const windowStart = weekAgo.toLocaleDateString("en-CA", { timeZone: tz });
    let recent;
    try {
      recent = await transactionsGet(accessToken, windowStart, windowEnd);
    } catch (e) {
      await log("Plaid.validateCursor", itemName + ": date-range fetch failed (" + (e instanceof Error ? e.message : String(e)) + "), skipping cursor validation");
      return false;
    }
    const missing = [];
    for (const t of recent) {
      if (syncStartDate && t.date && t.date < syncStartDate) continue;
      if (!seenIds.has(String(t.transaction_id))) {
        missing.push(t);
      }
    }
    if (missing.length === 0) {
      return false;
    }
    await error("Plaid.validateCursor", itemName + ": STALE CURSOR detected \u2014 " + missing.length + " transaction(s) in the last 7 days were missed by /transactions/sync. Resetting cursor and merging missing tx.");
    for (const t of missing) {
      result.added.push(t);
    }
    deleteProperty(cursorKey);
    await log("Plaid.validateCursor", itemName + ": cursor deleted (CURSOR_" + itemName + "). Next sync will rebuild it.");
    return true;
  }
  async function getAccounts(itemName) {
    const accessToken = getAccessToken(itemName);
    const data = await post("/accounts/get", { access_token: accessToken });
    await log("Plaid.getAccounts", "Accounts: " + JSON.stringify(data.accounts.map((a) => ({ id: a.account_id, name: a.name, type: a.type, subtype: a.subtype }))));
    return data.accounts;
  }
  async function getAccountNames(accountIds) {
    const map = {};
    const missing = [];
    for (const id of accountIds) {
      if (!id) continue;
      const cached = getProperty("ACCT_" + id);
      if (cached) {
        map[id] = cached;
      } else if (!missing.includes(id)) {
        missing.push(id);
      }
    }
    if (missing.length > 0) {
      const keys = getKeys();
      for (const k of keys) {
        if (!k.startsWith("ACCESS_TOKEN_")) continue;
        try {
          const data = await post("/accounts/get", { access_token: getProperty(k) });
          for (const acct of data.accounts) {
            const label = acct.name + (acct.mask ? " \u2022" + acct.mask : "");
            setProperty("ACCT_" + acct.account_id, label);
            const mi = missing.indexOf(acct.account_id);
            if (mi >= 0) {
              map[acct.account_id] = label;
              missing.splice(mi, 1);
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await log("Plaid.getAccountNames", "accounts/get failed for " + k + ": " + msg);
        }
        if (missing.length === 0) break;
      }
    }
    return map;
  }
  async function fetchBalances(itemName) {
    await log("Plaid.fetchBalances", "Fetching balances for: " + itemName);
    const accessToken = getAccessToken(itemName);
    const data = await post("/accounts/balance/get", { access_token: accessToken });
    const balances = [];
    for (const a of data.accounts) {
      const bal = {
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        available: a.balances.available,
        current: a.balances.current,
        iso_currency_code: a.balances.iso_currency_code
      };
      balances.push(bal);
      await log("Plaid.fetchBalances", bal.name + " (" + bal.type + "): available=" + bal.available + " current=" + bal.current);
    }
    return balances;
  }
  async function itemGet(accessToken) {
    return post("/item/get", { access_token: accessToken });
  }
  async function webhookUpdate(accessToken, webhookUrl) {
    return post("/item/webhook/update", { access_token: accessToken, webhook: webhookUrl });
  }
  async function transactionsGet(accessToken, startDate, endDate, accountMap) {
    await log("Plaid.transactionsGet", "Fetching transactions " + startDate + " -> " + endDate);
    let all = [];
    let page = 0;
    const pageSize = 500;
    let hasMore = true;
    while (hasMore) {
      const data = await post("/transactions/get", {
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { offset: page * pageSize, count: pageSize }
      });
      const txList = data.transactions || [];
      for (const t of txList) {
        if (accountMap && accountMap[t.account_id]) {
          t._account_name = accountMap[t.account_id].name;
          t._account_subtype = accountMap[t.account_id].subtype;
        }
        all.push(t);
      }
      hasMore = txList.length === pageSize;
      page++;
    }
    await log("Plaid.transactionsGet", "Fetched " + all.length + " transactions");
    return all;
  }
  async function investmentTransactionsGet(accessToken, startDate, endDate) {
    await log("Plaid.investmentTransactionsGet", "Fetching investment transactions " + startDate + " -> " + endDate);
    let all = [];
    let page = 0;
    const pageSize = 100;
    let hasMore = true;
    while (hasMore) {
      const data = await post("/investments/transactions/get", {
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { offset: page * pageSize, count: pageSize }
      });
      const txList = data.investment_transactions || [];
      all = all.concat(txList);
      hasMore = txList.length === pageSize;
      page++;
    }
    await log("Plaid.investmentTransactionsGet", "Fetched " + all.length + " investment transactions");
    return all;
  }
  var init_plaid = __esm({
    "src/plaid/index.ts"() {
      "use strict";
      init_config();
      init_debug();
      init_gas_bundle();
    }
  });

  // src/savings/index.ts
  var savings_exports = {};
  __export(savings_exports, {
    backfill: () => backfill,
    buildMonthMap: () => buildMonthMap,
    ensureTab: () => ensureTab3,
    fetchAllInvestmentTransactions: () => fetchAllInvestmentTransactions,
    fetchAllTransactions: () => fetchAllTransactions,
    getCategory: () => getCategory,
    isExcluded: () => isExcluded,
    normalizeMonth: () => normalizeMonth,
    populateManualAdjustments: () => populateManualAdjustments,
    readExisting: () => readExisting,
    writeSheet: () => writeSheet
  });
  async function ensureTab3() {
    await ensureTab(TAB, HEADERS);
  }
  async function readExisting() {
    const existing = {};
    try {
      const data = await getValues(TAB);
      for (let i = 1; i < data.length; i++) {
        const month = String(data[i][0] || "").trim();
        if (!month) continue;
        existing[month] = {
          manual_transfers: Number(data[i][5]) || 0,
          manual_retirement: Number(data[i][6]) || 0,
          manual_ally: Number(data[i][7]) || 0
        };
      }
    } catch {
    }
    return existing;
  }
  function normalizeMonth(value) {
    if (!value) return "";
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = value.getMonth() + 1;
      return y + "-" + (m < 10 ? "0" + m : String(m));
    }
    let s = String(value).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const m1 = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m1) {
      return m1[1] + "-" + (Number(m1[2]) < 10 ? "0" + m1[2] : m1[2]);
    }
    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m2) {
      const mo = Number(m2[1]);
      const y = m2[3];
      return y + "-" + (mo < 10 ? "0" + mo : String(mo));
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 7);
    return s;
  }
  function buildMonthMap(startDate, endDate, existing) {
    const map = {};
    const startParts = startDate.split("-");
    const endParts = endDate.substring(0, 7).split("-");
    const start = new Date(Number(startParts[0]), Number(startParts[1]) - 1, 1);
    const end = new Date(Number(endParts[0]), Number(endParts[1]) - 1, 1);
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const month = cursor.toISOString().substring(0, 7);
      const prev = existing[month] || {};
      map[month] = {
        transfers: 0,
        retirement: 0,
        ally: 0,
        manual_transfers: prev.manual_transfers || 0,
        manual_retirement: prev.manual_retirement || 0,
        manual_ally: prev.manual_ally || 0,
        details: []
      };
      cursor.setMonth(cursor.getMonth() + 1);
      count++;
    }
    log("Savings.buildMonthMap", "Generated " + count + " months: " + Object.keys(map).join(", "));
    return map;
  }
  function getCategory(t) {
    if (typeof t.category === "string") return t.category.toUpperCase();
    if (t.personal_finance_category && typeof t.personal_finance_category.primary === "string") {
      return t.personal_finance_category.primary.toUpperCase();
    }
    return "";
  }
  function isExcluded(text) {
    const lower = text.toLowerCase();
    return EXCLUDE_KEYWORDS.some((kw) => lower.includes(kw));
  }
  async function fetchAllTransactions(startDate, endDate) {
    const all = [];
    for (const itemName of BANK_ITEMS) {
      const token = getAccessToken(itemName);
      if (!token) continue;
      try {
        const accounts = await getAccounts(itemName);
        const accountMap = {};
        for (const a of accounts) {
          accountMap[a.account_id] = { name: a.name, subtype: a.subtype || "" };
        }
        const txs = await transactionsGet(token, startDate, endDate, accountMap);
        all.push(...txs);
        await log("Savings.fetchAllTransactions", itemName + ": done, total " + all.length);
      } catch (e) {
        await error("Savings.fetchAllTransactions", itemName + " failed: " + (e instanceof Error ? e.message : String(e)));
      }
    }
    return all;
  }
  async function fetchAllInvestmentTransactions(startDate, endDate) {
    const all = [];
    const investmentItems = ["fidelity"];
    for (const itemName of investmentItems) {
      const token = getAccessToken(itemName);
      if (!token) continue;
      try {
        const txs = await investmentTransactionsGet(token, startDate, endDate);
        all.push(...txs);
        await log("Savings.fetchAllInvestmentTransactions", itemName + ": done, total " + all.length);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.indexOf("PRODUCT_NOT_ENABLED") >= 0) {
          await log("Savings.fetchAllInvestmentTransactions", itemName + ": investments not enabled, skipping");
        } else {
          await error("Savings.fetchAllInvestmentTransactions", itemName + " failed: " + msg);
        }
      }
    }
    return all;
  }
  async function writeSheet(byMonth) {
    let existingRows = [];
    try {
      const existing = await getValues(TAB);
      if (existing && existing.length > 1) {
        existingRows = existing.slice(1);
      }
    } catch {
    }
    const allMonths = {};
    for (const row of existingRows) {
      const month = normalizeMonth(row[0]);
      if (month && !allMonths[month]) {
        allMonths[month] = row;
        allMonths[month][0] = month;
      }
    }
    const updatedMonths = Object.keys(byMonth).sort();
    for (const m of updatedMonths) {
      const d = byMonth[m];
      const detailText = d.details.join("\n");
      allMonths[m] = [m, "", d.transfers, d.retirement, d.ally, d.manual_transfers, d.manual_retirement, d.manual_ally, detailText];
    }
    const sortedMonths = Object.keys(allMonths).sort();
    const rows = [];
    for (let i = 0; i < sortedMonths.length; i++) {
      const m = sortedMonths[i];
      const rowNum = i + 2;
      const row = allMonths[m];
      const formula = "=C" + rowNum + "+D" + rowNum + "-E" + rowNum + "+F" + rowNum + "+G" + rowNum + "-H" + rowNum;
      rows.push([row[0], formula, row[2], row[3], row[4], row[5], row[6], row[7], row[8]]);
    }
    await clearTab(TAB, false);
    await setValues(TAB + "!A1", [HEADERS]);
    if (rows.length > 0) {
      await setValues(TAB + "!A2", rows);
    }
    await log("Savings.writeSheet", "Wrote " + rows.length + " row(s) (" + sortedMonths.length + " total months, " + updatedMonths.length + " updated)");
  }
  async function backfill(startDate, endDate) {
    const tz = getTimezone();
    const now = /* @__PURE__ */ new Date();
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz });
    const useStart = startDate || "2026-01-01";
    const useEnd = endDate || todayStr;
    await log("Savings.backfill", "startDate=" + useStart + " endDate=" + useEnd);
    await ensureTab3();
    const existing = await readExisting();
    const byMonth = buildMonthMap(useStart, useEnd, existing);
    const allTx = await fetchAllTransactions(useStart, useEnd);
    const allInvTx = await fetchAllInvestmentTransactions(useStart, useEnd);
    await log("Savings.backfill", "Fetched " + allTx.length + " bank tx, " + allInvTx.length + " investment tx");
    for (const t of allTx) {
      const rawDate = t.date || t.authorized_date || "";
      const dateStr = formatDateCell(rawDate, tz);
      if (!dateStr || dateStr < useStart || dateStr > useEnd) continue;
      const month = dateStr.substring(0, 7);
      if (!byMonth[month]) continue;
      const accountName = String(t._account_name || "").toLowerCase();
      const accountSubtype = String(t._account_subtype || "").toLowerCase();
      const category = getCategory(t);
      const merchant = String(t.merchant_name || "").toLowerCase();
      const name = String(t.name || "").toLowerCase();
      const amount = Number(t.amount) || 0;
      const isTransfer = category.includes("TRANSFER");
      const isChecking = accountSubtype === "checking" || accountName.includes("checking");
      const excluded = isExcluded(name + " " + merchant);
      if (isTransfer && isChecking && amount > 0 && !excluded) {
        byMonth[month].transfers += amount;
        byMonth[month].details.push(dateStr + ": Transfer to savings $" + amount + " (" + name + ")");
        continue;
      }
      if (accountName.includes("ally") && amount > 0) {
        byMonth[month].ally += amount;
        byMonth[month].details.push(dateStr + ": Ally outflow $" + amount + " (" + name + ")");
      }
    }
    for (const inv of allInvTx) {
      const invDateRaw = inv.date || "";
      const invDate = formatDateCell(invDateRaw, tz);
      if (!invDate || invDate < useStart || invDate > useEnd) continue;
      const invMonth = invDate.substring(0, 7);
      if (!byMonth[invMonth]) continue;
      const subtype = String(inv.subtype || "").toLowerCase();
      const invAmount = Number(inv.amount) || 0;
      const invName = String(inv.name || "");
      if (subtype === "contribution" && invAmount < 0) {
        const contrib = Math.abs(invAmount);
        byMonth[invMonth].retirement += contrib;
        byMonth[invMonth].details.push(invDate + ": 401k contrib $" + contrib + " (" + invName + ")");
      }
    }
    await writeSheet(byMonth);
    await log("Savings.backfill", "Wrote " + Object.keys(byMonth).length + " month(s)");
    await populateManualAdjustments();
  }
  async function populateManualAdjustments() {
    const data = await getValues(TAB);
    if (!data || data.length < 2) {
      await error("populateManualAdjustments", "savings_tracker tab not found");
      return;
    }
    const manual = {
      "2025-08": { transfers: 8e3, retirement: 0, ally: 0 },
      "2025-10": { transfers: 6400, retirement: 0, ally: 0 },
      "2025-11": { transfers: 1106.37, retirement: 0, ally: 0 },
      "2026-01": { transfers: 8e3, retirement: 0, ally: 0 },
      "2026-02": { transfers: 3e3, retirement: 0, ally: 0 },
      "2026-03": { transfers: 3e3, retirement: 0, ally: 3533 }
    };
    let updated = 0;
    for (let row = 1; row < data.length; row++) {
      const rawMonth = normalizeMonth(data[row][0]);
      if (manual[rawMonth]) {
        const rowNum = row + 1;
        await setCell(TAB, "F" + rowNum, manual[rawMonth].transfers);
        await setCell(TAB, "G" + rowNum, manual[rawMonth].retirement);
        await setCell(TAB, "H" + rowNum, manual[rawMonth].ally);
        await log("populateManualAdjustments", "Set manual values for " + rawMonth);
        updated++;
      }
    }
    await log("populateManualAdjustments", "Updated " + updated + " row(s).");
  }
  var TAB, HEADERS, BANK_ITEMS, EXCLUDE_KEYWORDS;
  var init_savings = __esm({
    "src/savings/index.ts"() {
      "use strict";
      init_sheet_api();
      init_debug();
      init_plaid();
      init_runtime();
      TAB = "savings_tracker";
      HEADERS = [
        "month",
        "net_savings",
        "transfers_auto",
        "retirement_auto",
        "ally_auto",
        "manual_transfers",
        "manual_retirement",
        "manual_ally_out",
        "details"
      ];
      BANK_ITEMS = ["ally", "bofa", "fidelity"];
      EXCLUDE_KEYWORDS = ["venmo", "zelle", "cash app", "paypal", "cashapp", "atm", "withdrawal", "withdrwl"];
    }
  });

  // src/sheet-ops/index.ts
  async function writeTransactions(syncResult) {
    const tabName = "transactions";
    await ensureTab(tabName, HEADERS2);
    let added = [];
    let modified = [];
    let removed = [];
    if (Array.isArray(syncResult)) {
      added = syncResult;
    } else if (syncResult) {
      added = syncResult.added || [];
      modified = syncResult.modified || [];
      removed = syncResult.removed || [];
    }
    const data = await getValues(tabName);
    const byId = {};
    const order = [];
    if (data.length > 1) {
      const oldHeader = data[0].map((h) => String(h));
      const idCol = oldHeader.indexOf("transaction_id");
      const effectiveIdCol = idCol < 0 ? 0 : idCol;
      for (let r = 1; r < data.length; r++) {
        const id = String(data[r][effectiveIdCol] || "");
        if (!id) continue;
        const lowerKey = id.toLowerCase();
        const obj = {};
        for (let c = 0; c < oldHeader.length; c++) {
          if (oldHeader[c]) obj[oldHeader[c]] = data[r][c];
        }
        byId[lowerKey] = obj;
        order.push(lowerKey);
      }
    }
    const needIds = [];
    function collect(id) {
      if (id && !needIds.includes(id)) needIds.push(String(id));
    }
    for (const t of added) collect(t.account_id);
    for (const t of modified) collect(t.account_id);
    for (const oid in byId) {
      if (!byId[oid].account_name) collect(byId[oid].account_id);
    }
    const acctNames = needIds.length > 0 ? await getAccountNames(needIds) : {};
    const now = (/* @__PURE__ */ new Date()).toISOString();
    function toRow(t) {
      return [
        t.account_name || acctNames[String(t.account_id)] || "",
        t.authorized_date || t.date || "",
        t.merchant_name || "",
        t.amount,
        t.transaction_id,
        t.account_id,
        t.name || "",
        typeof t.category === "string" ? t.category : t.personal_finance_category ? t.personal_finance_category.primary : "",
        t.payment_channel || "",
        t.pending === true || t.pending === "TRUE" ? "TRUE" : "FALSE",
        t.currency || t.iso_currency_code || "USD",
        t.synced_at || now
      ];
    }
    let addedCount = 0, updatedCount = 0, removedCount = 0, dupeCount = 0;
    for (const t of removed) {
      const rid = String(t.transaction_id || "").toLowerCase();
      if (byId[rid]) {
        delete byId[rid];
        removedCount++;
      }
    }
    for (const t of modified) {
      const mid = String(t.transaction_id || "").toLowerCase();
      if (byId[mid]) {
        byId[mid] = t;
        updatedCount++;
      } else {
        byId[mid] = t;
        order.push(mid);
        addedCount++;
      }
    }
    for (const t of added) {
      const aid = String(t.transaction_id || "").toLowerCase();
      if (byId[aid]) {
        dupeCount++;
        continue;
      }
      byId[aid] = t;
      order.push(aid);
      addedCount++;
    }
    const out = [];
    for (const k of order) {
      if (byId[k]) out.push(toRow(byId[k]));
    }
    await clearTab(tabName, true);
    await setValues(`${tabName}!A1`, [HEADERS2]);
    if (out.length > 0) {
      await setValues(`${tabName}!A2`, out);
    }
    await log("SheetOps.writeTransactions", "Added: " + addedCount + ", Updated: " + updatedCount + ", Removed: " + removedCount + ", Dupes skipped: " + dupeCount + ", Total rows: " + out.length);
  }
  async function writeBalances(balances) {
    const tabName = "dashboard";
    let total = 0;
    for (const b of balances) {
      const bal = (b.available !== null ? b.available : b.current) ?? 0;
      if (b.type === "credit") {
        total -= bal;
      } else {
        total += bal;
      }
    }
    try {
      await setCell(tabName, "B1", total);
      await log("SheetOps.writeBalances", "Total available balance: " + total);
    } catch {
      await log("SheetOps.writeBalances", "Dashboard tab not found, skipping balance write");
    }
  }
  async function pruneOldData(currentMonth) {
    const normalizedMonth = normalizeMonth(currentMonth);
    if (!normalizedMonth) return {};
    const minDate = normalizedMonth + "-01";
    const tabsToPrune = ["transactions", "interview_income", "adjustments"];
    const tz = getTimezone();
    const prunedCounts = {};
    for (const tab of tabsToPrune) {
      try {
        const data = await getValues(tab);
        if (!data || data.length < 2) continue;
        const header = data[0].map((h) => String(h));
        const dateCol = header.indexOf("date");
        if (dateCol < 0) continue;
        const keptRows = [];
        let prunedCount = 0;
        for (let r = 1; r < data.length; r++) {
          const row = data[r];
          const rawDate = row[dateCol];
          const dateStr = formatDateCell(rawDate, tz);
          if (!dateStr || dateStr < minDate) {
            prunedCount++;
          } else {
            keptRows.push(row);
          }
        }
        if (prunedCount > 0) {
          await clearTab(tab, true);
          if (keptRows.length > 0) {
            await setValues(`${tab}!A2`, keptRows);
          }
          await log("SheetOps.pruneOldData", "Pruned " + prunedCount + " old row(s) from " + tab + " (kept " + keptRows.length + ")");
        }
        prunedCounts[tab] = prunedCount;
      } catch (e) {
        await error("SheetOps.pruneOldData", "Failed to prune tab " + tab + ": " + (e instanceof Error ? e.message : String(e)));
      }
    }
    return prunedCounts;
  }
  var HEADERS2;
  var init_sheet_ops = __esm({
    "src/sheet-ops/index.ts"() {
      "use strict";
      init_sheet_api();
      init_debug();
      init_plaid();
      init_runtime();
      init_savings();
      HEADERS2 = [
        "account_name",
        "date",
        "merchant_name",
        "amount",
        "transaction_id",
        "account_id",
        "name",
        "category",
        "payment_channel",
        "pending",
        "currency",
        "synced_at"
      ];
    }
  });

  // src/recurring/index.ts
  async function calculateUpcoming(year, monthNum, _today) {
    const data = await getValues(TAB2);
    if (!data || data.length < 2) return { upcoming: 0, items: [] };
    const header = data[0].map((h) => String(h));
    const merchCol = header.indexOf("merchant_name");
    const amtCol = header.indexOf("amount");
    const freqCol = header.indexOf("frequency");
    if (merchCol < 0 || amtCol < 0 || freqCol < 0) {
      await error("Recurring.calculateUpcoming", "recurring tab missing required columns");
      return { upcoming: 0, items: [] };
    }
    const tz = getTimezone();
    const monthStart = new Date(year, monthNum - 1, 1).toLocaleDateString("en-CA", { timeZone: tz });
    const monthEnd = new Date(year, monthNum, 0).toLocaleDateString("en-CA", { timeZone: tz });
    const txData = await getTransactionData(monthStart, monthEnd);
    let upcomingTotal = 0;
    const upcomingItems = [];
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const merchant = String(row[merchCol] || "").toLowerCase().trim();
      const amount = Number(row[amtCol]) || 0;
      const frequency = String(row[freqCol] || "").toLowerCase().trim();
      if (!merchant || amount <= 0) continue;
      const postedCount = countMatches(merchant, txData);
      const expectedCount = frequency === "weekly" ? 4 : 1;
      const remainingCount = Math.max(0, expectedCount - postedCount);
      const upcomingAmount = Math.round(remainingCount * amount * 100) / 100;
      if (upcomingAmount > 0) {
        upcomingTotal += upcomingAmount;
        upcomingItems.push({
          merchant,
          amount,
          frequency,
          remaining: remainingCount,
          upcomingAmount
        });
      }
    }
    await log("Recurring.calculateUpcoming", "Upcoming: $" + upcomingTotal + " from " + upcomingItems.length + " bill(s)");
    return { upcoming: upcomingTotal, items: upcomingItems };
  }
  async function getTransactionData(startDate, endDate) {
    const data = await getValues("transactions");
    if (!data || data.length < 2) return [];
    const header = data[0].map((h) => String(h));
    const dateCol = header.indexOf("date");
    const merchCol = header.indexOf("merchant_name");
    const nameCol = header.indexOf("name");
    if (dateCol < 0) return [];
    const results = [];
    const tz = getTimezone();
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const rawDate = row[dateCol];
      const dateStr = formatDateCell(rawDate, tz);
      if (dateStr < startDate || dateStr > endDate) continue;
      results.push({
        merchant_name: String(row[merchCol] || ""),
        name: String(row[nameCol] || "")
      });
    }
    return results;
  }
  function countMatches(searchTerm, txData) {
    let count = 0;
    for (const t of txData) {
      if (isMatch(searchTerm, t)) {
        count++;
      }
    }
    return count;
  }
  function isMatch(searchTerm, tx) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return false;
    const merchant = String(tx.merchant_name || "").toLowerCase().trim();
    const name = String(tx.name || "").toLowerCase().trim();
    const targets = [merchant, name].filter(Boolean);
    if (targets.length === 0) return false;
    for (const target of targets) {
      if (target.includes(term)) return true;
    }
    const cleanTerm = term.replace(/[^a-z0-9]/g, "");
    if (cleanTerm.length >= 3) {
      for (const target of targets) {
        const cleanTarget = target.replace(/[^a-z0-9]/g, "");
        if (cleanTarget.includes(cleanTerm)) return true;
        if (cleanTarget.length >= 4 && cleanTerm.includes(cleanTarget)) return true;
      }
    }
    const tokens = term.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      const single = tokens[0];
      const escaped = escapeRegex(single);
      const wordRegex = new RegExp(`\\b${escaped}\\b`, "i");
      for (const target of targets) {
        if (single.length >= 4 ? target.includes(single) : wordRegex.test(target)) {
          return true;
        }
      }
    } else if (tokens.length > 1) {
      for (const target of targets) {
        const allTokensMatch = tokens.every((tok) => {
          if (tok.length >= 4) {
            return target.includes(tok);
          }
          const regex = new RegExp(`\\b${escapeRegex(tok)}\\b`, "i");
          return regex.test(target);
        });
        if (allTokensMatch) return true;
        const significantTokenMatch = tokens.some((tok) => {
          if (tok.length < 4) return false;
          const regex = new RegExp(`\\b${escapeRegex(tok)}\\b`, "i");
          return regex.test(target) || target.includes(tok);
        });
        if (significantTokenMatch) return true;
      }
    }
    return false;
  }
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  var TAB2;
  var init_recurring = __esm({
    "src/recurring/index.ts"() {
      "use strict";
      init_sheet_api();
      init_debug();
      init_runtime();
      TAB2 = "recurring";
    }
  });

  // src/snapshot/index.ts
  var snapshot_exports = {};
  __export(snapshot_exports, {
    autoSnapshotOnRollover: () => autoSnapshotOnRollover,
    snapshotCurrentMonth: () => snapshotCurrentMonth,
    snapshotMonth: () => snapshotMonth
  });
  async function snapshotMonth(month) {
    const suffix = "_" + month;
    const created = [];
    const skipped = [];
    for (const srcName of TABS) {
      const dstName = srcName + suffix;
      try {
        const sheetId = await copySheet(srcName, dstName);
        if (sheetId !== null) {
          created.push(dstName);
        } else {
          skipped.push(srcName + " (missing)");
        }
      } catch {
        skipped.push(srcName + " (error)");
      }
    }
    await log(
      "Snapshot.snapshotMonth",
      "Month " + month + ": created " + created.length + " snapshots" + (skipped.length ? ", skipped: " + skipped.join(", ") : "")
    );
    return { created, skipped };
  }
  async function snapshotCurrentMonth() {
    let month;
    try {
      month = await getCell("dashboard", "B4");
    } catch {
      await error("Snapshot.snapshotCurrentMonth", "dashboard tab not found");
      return;
    }
    if (!month || typeof month !== "string" || month.indexOf("-") === -1) {
      await error("Snapshot.snapshotCurrentMonth", "Invalid month in dashboard B4: " + month);
      return;
    }
    return snapshotMonth(month);
  }
  async function autoSnapshotOnRollover(previousMonth) {
    if (!previousMonth) return;
    await log("Snapshot.autoSnapshotOnRollover", "Auto-snapshotting previous month: " + previousMonth);
    return snapshotMonth(previousMonth);
  }
  var TABS;
  var init_snapshot = __esm({
    "src/snapshot/index.ts"() {
      "use strict";
      init_sheet_api();
      init_debug();
      TABS = ["transactions", "interview_income", "adjustments", "dashboard"];
    }
  });

  // src/calendar/index.ts
  var calendar_exports = {};
  __export(calendar_exports, {
    dumpCalendarEvents: () => dumpCalendarEvents,
    looksLikeInterview: () => looksLikeInterview,
    parseCalendarEvents: () => parseCalendarEvents
  });
  async function parseCalendarEvents(daysBack, daysForward) {
    const db = daysBack || 90;
    const df = daysForward || 30;
    const events = gasCalendar.listEvents(db, df);
    const resolved = events instanceof Promise ? await events : events;
    await log("Calendar.parseCalendarEvents", "Scanning " + resolved.length + " events");
    const now = /* @__PURE__ */ new Date();
    const tz = getTimezone();
    const currentMonthStr = now.toLocaleDateString("en-CA", { timeZone: tz }).substring(0, 7);
    const minDate = currentMonthStr + "-01";
    const interviews = [];
    for (const e of resolved) {
      if (!looksLikeInterview(e.summary, e.description)) continue;
      const dateStr = e.startDate.toLocaleDateString("en-CA", { timeZone: tz });
      if (dateStr < minDate) continue;
      const status = e.startDate < now ? "Past" : "Upcoming";
      interviews.push({ date: dateStr, title: e.summary, status });
    }
    await log("Calendar.parseCalendarEvents", "Found " + interviews.length + " interview events");
    const headers = ["date", "title", "status"];
    await ensureTab(TAB3, headers);
    const rows = interviews.map((iv) => [iv.date, iv.title, iv.status]);
    await clearTab(TAB3, true);
    await setValues(TAB3 + "!A1", [headers]);
    if (rows.length > 0) await setValues(TAB3 + "!A2", rows);
    await log("Calendar.parseCalendarEvents", "Wrote " + rows.length + " rows to " + TAB3);
  }
  async function dumpCalendarEvents(daysBack, daysForward) {
    const db = daysBack || 30;
    const df = daysForward || 30;
    const events = gasCalendar.listEvents(db, df);
    const resolved = events instanceof Promise ? await events : events;
    await log("Calendar.dumpCalendarEvents", "Found " + resolved.length + " events");
    for (const e of resolved) {
      const dateStr = e.startDate.toLocaleDateString("en-CA");
      await log("Calendar.dumpCalendarEvents", dateStr + " | " + e.summary + " | " + e.description.substring(0, 60));
    }
  }
  function looksLikeInterview(summary, description = "") {
    const summaryTrimmed = summary.trim();
    if (/^interview with .+ \| .+ interviews$/i.test(summaryTrimmed)) {
      return true;
    }
    const combined = (summary + " " + description).toLowerCase();
    if (combined.includes("interviewkickstart") || combined.includes("interview kickstart")) {
      return true;
    }
    return false;
  }
  var TAB3;
  var init_calendar = __esm({
    "src/calendar/index.ts"() {
      "use strict";
      init_gas_bundle();
      init_sheet_api();
      init_debug();
      init_runtime();
      TAB3 = "interview_income";
    }
  });

  // src/dashboard/index.ts
  async function init() {
    const data = await getValues(TAB4);
    let existingTarget = null;
    if (data && data.length > 4) {
      const b5 = data[4][1];
      if (b5 !== "" && b5 !== null && !isNaN(Number(b5))) {
        existingTarget = Number(b5);
      }
    }
    const tz = getTimezone();
    const now = /* @__PURE__ */ new Date();
    const monthStr = now.toLocaleDateString("en-CA", { timeZone: tz }).slice(0, 7);
    const layout = [
      ["Finance Tracker Dashboard", "", ""],
      ["Refresh All", "", "Click checkbox to sync transactions, savings, and calendar"],
      ["Controls", "", ""],
      ["Month (YYYY-MM)", monthStr, ""],
      ["Monthly Target", existingTarget !== null ? existingTarget : 4e3, ""],
      ["", "", ""],
      ["The 3 Numbers", "", ""],
      ["Actual Spend", "", "Money out (excl transfers)"],
      ["Interview Income", "", "From Calendar parser"],
      ["Manual Adjustments", "", "Refunds, cash, corrections"],
      ["Net Income", "", "9000 + interviews + manual - spend - recurring"],
      ["", "", ""],
      ["Daily Budget", "", "(Net Income - target) / days remaining"],
      ["Upcoming Bills (unpaid)", "", "From recurring tab"],
      ["Include Upcoming in Spend", 1, "0 = actual only, 1 = include expected bills"],
      ["", "", ""],
      ["Savings Summary", "", ""],
      ["Total Saved", "=SUM(savings_tracker!B2:B)", "All months combined"],
      ["Avg Monthly Savings", "=AVERAGE(savings_tracker!B2:B)", "Average per month"],
      ["Months Saved", "=COUNT(savings_tracker!B2:B)", "Number of months with data"],
      ["", "", ""],
      ["Interview Settings", "", ""],
      ["Standard Rate ($)", 85, "Coding / Behavioral / System Design"],
      ["Non-Standard Rate ($)", 115, "Other interview types"],
      ["Cancellation Rate ($)", 75, "No-show / late cancellation"],
      ["Tax Scalar", 0.7, "Applied to gross"],
      ["Count Upcoming Interviews", 1, "0 = past only, 1 = include upcoming"],
      ["", "", ""],
      ["Manual Inputs (resets monthly)", "", ""],
      ["# Non-Standard Interviews", 0, "Transforms $85 \u2192 $115"],
      ["# Late Cancellations", 0, "Manual entry \u2014 event removed from calendar"],
      ["", "", ""],
      ["Account Sync Status", "", "Last successful Plaid sync per account"]
    ];
    await setValues(`${TAB4}!A1:C${layout.length}`, layout);
    await log("Dashboard.init", "Dashboard initialized");
  }
  async function refresh() {
    await log("Dashboard.refresh", "Refreshing dashboard...");
    await maybeResetManualInputs();
    const ss2 = await getValues(TAB4);
    if (!ss2 || ss2.length === 0) {
      await init();
      return;
    }
    const month = String(ss2[3][1] || "").trim();
    if (!month || month.indexOf("-") === -1) {
      await error("Dashboard.refresh", "Invalid month in B4: " + month);
      return;
    }
    const parts = month.split("-");
    const year = Number(parts[0]);
    const monthNum = Number(parts[1]);
    try {
      await pruneOldData(month);
    } catch (e) {
      await error("Dashboard.refresh", "Pruning failed: " + (e instanceof Error ? e.message : String(e)));
    }
    const today = /* @__PURE__ */ new Date();
    const startOfMonth = year + "-" + padMonth(monthNum) + "-01";
    const endOfMonth = year + "-" + padMonth(monthNum) + "-" + daysInMonth(year, monthNum);
    const actualSpend = await calculateSpend(startOfMonth, endOfMonth);
    const interviewIncome = await calculateInterviewIncome(month);
    const manualAdjustments = await calculateManualAdjustments(startOfMonth, endOfMonth);
    const recurring = await calculateUpcoming(year, monthNum, today);
    const includeUpcoming = Number(ss2[14][1] || 0);
    const adjustedSpend = actualSpend + (includeUpcoming ? recurring.upcoming : 0);
    const netIncome = 9e3 + interviewIncome + manualAdjustments - adjustedSpend;
    const daysLeft = Math.max(1, daysInMonth(year, monthNum) - today.getDate() + 1);
    const target = Number(ss2[4][1] || 0) || 4e3;
    const dailyBudget = daysLeft > 0 ? (netIncome - target) / daysLeft : 0;
    await setCell(TAB4, "B8", actualSpend);
    await setCell(TAB4, "B9", interviewIncome);
    await setCell(TAB4, "B10", manualAdjustments);
    await setCell(TAB4, "B11", netIncome);
    await setCell(TAB4, "B13", dailyBudget);
    await setCell(TAB4, "C13", "Target: " + target + ", " + daysLeft + " days left");
    await setCell(TAB4, "B14", recurring.upcoming);
    await writeSyncStatus();
    await log("Dashboard.refresh", "Dashboard refreshed for " + month);
  }
  async function calculateSpend(startDate, endDate) {
    const tx = await getValues("transactions");
    if (!tx || tx.length < 2) {
      await log("Dashboard.calculateSpend", "No transactions found");
      return 0;
    }
    const header = tx[0].map((h) => String(h));
    const dateCol = header.indexOf("date");
    const amountCol = header.indexOf("amount");
    const categoryCol = header.indexOf("category");
    const nameCol = header.indexOf("name");
    const merchantCol = header.indexOf("merchant_name");
    const txIdCol = header.indexOf("transaction_id");
    if (dateCol < 0 || amountCol < 0) {
      await log("Dashboard.calculateSpend", "Missing columns: date=" + dateCol + " amount=" + amountCol);
      return 0;
    }
    await log("Dashboard.calculateSpend", "Checking " + (tx.length - 1) + " transactions from " + startDate + " to " + endDate + ", dateCol=" + dateCol);
    const sampleDates = [];
    for (let r = 1; r < Math.min(tx.length, 6); r++) {
      const raw = tx[r][dateCol];
      sampleDates.push("row" + r + "=" + JSON.stringify(raw) + "(type=" + typeof raw + ")");
    }
    await log("Dashboard.calculateSpend", "Sample dates: " + sampleDates.join(", "));
    let total = 0;
    let count = 0;
    let skippedDate = 0;
    let skippedTransfer = 0;
    let skippedAtm = 0;
    let skippedNegative = 0;
    let skippedDupe = 0;
    const seenTxIds = /* @__PURE__ */ new Set();
    const OWN_ACCOUNT_KEYWORDS = ["brokerage", "pershing", "fidelity", "401k", "ally", "savings", "checking"];
    const tz = getTimezone();
    for (let r = 1; r < tx.length; r++) {
      const row = tx[r];
      if (txIdCol >= 0) {
        const rawTxId = String(row[txIdCol] || "").trim();
        if (rawTxId) {
          const lowerTxId = rawTxId.toLowerCase();
          if (seenTxIds.has(lowerTxId)) {
            skippedDupe++;
            continue;
          }
          seenTxIds.add(lowerTxId);
        }
      }
      const rawDate = row[dateCol];
      const dateStr = formatDateCell(rawDate, tz);
      if (dateStr < startDate || dateStr > endDate) {
        skippedDate++;
        continue;
      }
      const category = String(row[categoryCol] || "").toUpperCase();
      const name = String(row[nameCol] || "").toLowerCase();
      const merchant = merchantCol >= 0 ? String(row[merchantCol] || "").toLowerCase() : "";
      const combinedText = name + " " + merchant;
      const isAtm = combinedText.includes("atm") || combinedText.includes("withdrawal") || combinedText.includes("withdrwl");
      if (isAtm) {
        skippedAtm++;
        continue;
      }
      const isOwnAccountTransfer = OWN_ACCOUNT_KEYWORDS.some((kw) => combinedText.includes(kw));
      if (category === "TRANSFER" || category === "LOAN_PAYMENTS" || name.indexOf("transfer") >= 0 || isOwnAccountTransfer) {
        skippedTransfer++;
        continue;
      }
      const amount = Number(row[amountCol]) || 0;
      if (amount > 0) {
        total += amount;
        count++;
      } else {
        skippedNegative++;
      }
    }
    await log("Dashboard.calculateSpend", "Counted " + count + " transactions, total=$" + total + " (skipped: " + skippedDate + " date, " + skippedTransfer + " transfer, " + skippedAtm + " ATM, " + skippedDupe + " dupe, " + skippedNegative + " negative)");
    return Math.round(total * 100) / 100;
  }
  async function calculateInterviewIncome(month) {
    const sheet = await getValues("interview_income");
    if (!sheet || sheet.length < 2) {
      await log("Dashboard.calculateInterviewIncome", "No interview data found");
      return 0;
    }
    const header = sheet[0].map((h) => String(h));
    const dateCol = header.indexOf("date");
    const statusCol = header.indexOf("status");
    const dash = await getValues("dashboard");
    const standardRate = Number(dash[22][1] || 85);
    const nonStandardRate = Number(dash[23][1] || 115);
    const cancellationRate = Number(dash[24][1] || 75);
    const taxScalar = Number(dash[25][1] || 0.7);
    const countUpcoming = Number(dash[26][1] || 1);
    const nonStandardCount = Number(dash[29][1] || 0);
    const lateCancellationCount = Number(dash[30][1] || 0);
    await log("Dashboard.calculateInterviewIncome", "Calculating for month=" + month + " total interviews=" + (sheet.length - 1) + " rates: std=" + standardRate + " nonstd=" + nonStandardRate + " cancel=" + cancellationRate + " tax=" + taxScalar);
    let count = 0;
    const tz = getTimezone();
    for (let r = 1; r < sheet.length; r++) {
      const row = sheet[r];
      const rawDate = row[dateCol];
      const dateStr = formatDateCell(rawDate, tz);
      if (!dateStr.startsWith(month)) continue;
      const status = String(row[statusCol] || "");
      if (status === "Upcoming" && !countUpcoming) continue;
      count++;
    }
    const standardCount = Math.max(0, count - nonStandardCount);
    const gross = standardCount * standardRate + nonStandardCount * nonStandardRate + lateCancellationCount * cancellationRate;
    await log("Dashboard.calculateInterviewIncome", "Counted " + count + " interviews in " + month + " (std=" + standardCount + " nonstd=" + nonStandardCount + " cancel=" + lateCancellationCount + ") gross=$" + gross + " after tax=$" + Math.round(gross * taxScalar * 100) / 100);
    return Math.round(gross * taxScalar * 100) / 100;
  }
  async function calculateManualAdjustments(startDate, endDate) {
    const sheet = await getValues("adjustments");
    if (!sheet || sheet.length < 2) {
      await log("Dashboard.calculateManualAdjustments", "No adjustments found");
      return 0;
    }
    const header = sheet[0].map((h) => String(h));
    const dateCol = header.indexOf("date");
    const amountCol = header.indexOf("amount");
    if (dateCol < 0 || amountCol < 0) {
      await log("Dashboard.calculateManualAdjustments", "Missing columns: date=" + dateCol + " amount=" + amountCol);
      return 0;
    }
    await log("Dashboard.calculateManualAdjustments", "Checking " + (sheet.length - 1) + " adjustments from " + startDate + " to " + endDate);
    let total = 0;
    let count = 0;
    let skipped = 0;
    const tz = getTimezone();
    for (let r = 1; r < sheet.length; r++) {
      const row = sheet[r];
      const rawDate = row[dateCol];
      const dateStr = formatDateCell(rawDate, tz);
      if (!dateStr || dateStr < startDate || dateStr > endDate) {
        skipped++;
        continue;
      }
      const amount = Number(row[amountCol]) || 0;
      total += amount;
      count++;
    }
    await log("Dashboard.calculateManualAdjustments", "Counted " + count + " adjustments, total=$" + total + " (skipped " + skipped + " outside date range)");
    return Math.round(total * 100) / 100;
  }
  async function maybeResetManualInputs() {
    const ss2 = await getValues("dashboard");
    if (!ss2 || ss2.length < 31) return;
    const rawStored = await getCell("dashboard", "B32");
    const storedMonth = normalizeMonth(rawStored);
    const currentMonth = normalizeMonth(ss2[3][1]);
    if (storedMonth && currentMonth && storedMonth !== currentMonth) {
      await log("Dashboard.maybeResetManualInputs", "Month rollover detected: " + storedMonth + " -> " + currentMonth);
      try {
        const { autoSnapshotOnRollover: autoSnapshotOnRollover2 } = await Promise.resolve().then(() => (init_snapshot(), snapshot_exports));
        await autoSnapshotOnRollover2(storedMonth);
      } catch (e) {
        await error("Dashboard.maybeResetManualInputs", "Snapshot failed: " + (e instanceof Error ? e.message : String(e)));
      }
      await setCell("dashboard", "B30", 0);
      await setCell("dashboard", "B31", 0);
      await log("Dashboard.maybeResetManualInputs", "Reset manual inputs for new month: " + currentMonth);
    }
    if (currentMonth) {
      await setCell("dashboard", "B32", currentMonth);
    }
  }
  function padMonth(m) {
    return m < 10 ? "0" + m : String(m);
  }
  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }
  async function refreshAll() {
    const startTime = Date.now();
    await log("refreshAll", "=== Starting full refresh ===");
    try {
      await log("refreshAll", "Step 1/4: Syncing transactions...");
      const { syncAllProductionAccounts: syncAllProductionAccounts2 } = await Promise.resolve().then(() => (init_sync(), sync_exports));
      await syncAllProductionAccounts2();
    } catch (e) {
      await error("refreshAll", "Transactions sync failed: " + (e instanceof Error ? e.message : String(e)));
    }
    try {
      await log("refreshAll", "Step 2/4: Parsing calendar events...");
      const { parseCalendarEvents: parseCalendarEvents2 } = await Promise.resolve().then(() => (init_calendar(), calendar_exports));
      await parseCalendarEvents2();
    } catch (e) {
      await error("refreshAll", "Calendar parse failed: " + (e instanceof Error ? e.message : String(e)));
    }
    try {
      await log("refreshAll", "Step 3/4: Backfilling savings...");
      const { backfill: backfill2 } = await Promise.resolve().then(() => (init_savings(), savings_exports));
      await backfill2("2026-01-01");
    } catch (e) {
      await error("refreshAll", "Savings backfill failed: " + (e instanceof Error ? e.message : String(e)));
    }
    try {
      await log("refreshAll", "Step 4/4: Refreshing dashboard...");
      await refresh();
    } catch (e) {
      await error("refreshAll", "Dashboard refresh failed: " + (e instanceof Error ? e.message : String(e)));
    }
    const elapsed = (Date.now() - startTime) / 1e3;
    await log("refreshAll", "=== Full refresh complete in " + elapsed.toFixed(1) + "s ===");
  }
  async function writeSyncStatus() {
    const keys = getKeys();
    let row = 33;
    await setCell(TAB4, "A" + row, "Account Sync Status");
    await setCell(TAB4, "C" + row, "Last successful Plaid sync per account");
    row++;
    for (const k of keys) {
      if (k.startsWith("ACCESS_TOKEN_")) {
        const itemName = k.replace("ACCESS_TOKEN_", "");
        const lastSync = getProperty("LAST_SYNC_" + itemName) || "never";
        await setCell(TAB4, "A" + row, itemName);
        await setCell(TAB4, "B" + row, lastSync);
        row++;
      }
    }
    await log("Dashboard.writeSyncStatus", "Wrote sync status for " + (row - 34) + " account(s)");
  }
  var TAB4;
  var init_dashboard = __esm({
    "src/dashboard/index.ts"() {
      "use strict";
      init_sheet_api();
      init_debug();
      init_recurring();
      init_config();
      init_runtime();
      init_savings();
      init_sheet_ops();
      TAB4 = "dashboard";
    }
  });

  // src/sync/index.ts
  var sync_exports = {};
  __export(sync_exports, {
    recordSync: () => recordSync,
    resetAndResync: () => resetAndResync,
    syncAllProductionAccounts: () => syncAllProductionAccounts,
    syncProductionAccount: () => syncProductionAccount
  });
  function recordSync(itemName) {
    const tz = getTimezone();
    const ts = (/* @__PURE__ */ new Date()).toLocaleString("en-CA", { timeZone: tz });
    setProperty("LAST_SYNC_" + itemName, ts);
    return ts;
  }
  async function syncProductionAccount(itemName) {
    await log("syncProductionAccount", "Syncing: " + itemName);
    const result = await syncTransactions(itemName);
    await writeTransactions(result);
    const balances = await fetchBalances(itemName);
    await writeBalances(balances);
    const ts = recordSync(itemName);
    await log("syncProductionAccount", "[OK] " + itemName + " synced: " + result.added.length + " new, " + result.modified.length + " updated, " + result.removed.length + " removed. last_sync=" + ts);
  }
  async function syncAllProductionAccounts() {
    await log("syncAllProductionAccounts", "Syncing all linked accounts...");
    const keys = getKeys();
    let synced = 0;
    let allBalances = [];
    for (const k of keys) {
      if (k.startsWith("ACCESS_TOKEN_")) {
        const itemName = k.replace("ACCESS_TOKEN_", "");
        await log("syncAllProductionAccounts", "Syncing: " + itemName);
        try {
          const result = await syncTransactions(itemName);
          await writeTransactions(result);
          const balances = await fetchBalances(itemName);
          allBalances = allBalances.concat(balances);
          const ts = recordSync(itemName);
          await log("syncAllProductionAccounts", itemName + " done: " + result.added.length + " new, " + result.modified.length + " updated, " + result.removed.length + " removed. last_sync=" + ts);
          synced++;
        } catch (e) {
          await error("syncAllProductionAccounts", itemName + " failed: " + (e instanceof Error ? e.message : String(e)));
        }
      }
    }
    if (allBalances.length > 0) {
      await writeBalances(allBalances);
    }
    try {
      await parseCalendarEvents();
    } catch (e) {
      await error("syncAllProductionAccounts", "Calendar parse failed: " + (e instanceof Error ? e.message : String(e)));
    }
    await refresh();
    await log("syncAllProductionAccounts", "[OK] " + synced + " accounts synced. Dashboard refreshed.");
  }
  async function resetAndResync() {
    await log("resetAndResync", "=== Starting reset & resync ===");
    try {
      await deleteSheet("transactions");
      await log("resetAndResync", "Deleted transactions tab.");
    } catch {
    }
    const keys = getKeys();
    for (const k of keys) {
      if (k.startsWith("CURSOR_")) {
        deleteProperty(k);
        await log("resetAndResync", "Cleared cursor: " + k);
      } else if (k.startsWith("ACCESS_TOKEN_platypus")) {
        deleteProperty(k);
        await log("resetAndResync", "Removed sandbox token: " + k);
      }
    }
    await syncAllProductionAccounts();
    await log("resetAndResync", "=== Reset & resync complete. Future updates arrive via webhook. ===");
  }
  var init_sync = __esm({
    "src/sync/index.ts"() {
      "use strict";
      init_debug();
      init_plaid();
      init_sheet_ops();
      init_sheet_api();
      init_config();
      init_dashboard();
      init_calendar();
      init_runtime();
    }
  });

  // src/gas-entry.ts
  init_debug();
  init_plaid();
  init_sheet_ops();
  init_sync();
  init_dashboard();
  init_savings();
  init_config();
  globalThis.doPost = function(e) {
    ensureTab2();
    if (!e || !e.postData) {
      log("doPost", "No POST data received");
      return ContentService.createTextOutput(JSON.stringify({ error: "no data" })).setMimeType(ContentService.MimeType.JSON);
    }
    const rawBody = e.postData.contents;
    log("doPost", "POST body: " + rawBody.substring(0, 500));
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed.public_token) {
        log("doPost", "PLAID REDIRECT WITH PUBLIC TOKEN");
        return ContentService.createTextOutput(JSON.stringify({ status: "token_received" })).setMimeType(ContentService.MimeType.JSON);
      }
    } catch (_) {
    }
    try {
      const data = JSON.parse(rawBody);
      logRaw("doPost", data);
      const webhookType = data.webhook_type;
      const webhookCode = data.webhook_code;
      const itemId = data.item_id;
      log("doPost", "Webhook: " + webhookType + " / " + webhookCode + " for " + itemId);
      const SYNC_CODES = ["SYNC_UPDATES_AVAILABLE", "INITIAL_UPDATE", "HISTORICAL_UPDATE", "DEFAULT_UPDATE"];
      if (webhookType === "TRANSACTIONS" && SYNC_CODES.indexOf(webhookCode) >= 0) {
        const itemName = _findItemNameByItemId(itemId);
        if (itemName) {
          log("doPost", "Syncing: " + itemName);
          syncTransactions(itemName).then(function(result) {
            writeTransactions(result);
            log("doPost", "Sync done: " + result.added.length + " new");
            _refreshAllBalances();
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      error("doPost", err);
      return ContentService.createTextOutput(JSON.stringify({ error: err.message || String(err) })).setMimeType(ContentService.MimeType.JSON);
    }
  };
  globalThis.doGet = function(e) {
    ensureTab2();
    log("doGet", "GET received at " + (/* @__PURE__ */ new Date()).toISOString());
    if (e && e.parameter && e.parameter.public_token) {
      log("doGet", "PLAID LINK REDIRECT: " + e.parameter.public_token);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
  };
  function _findItemNameByItemId(itemId) {
    if (!itemId) return null;
    const props = PropertiesService.getScriptProperties();
    const cached = props.getProperty("ITEMID_" + itemId);
    if (cached) return cached;
    const keys = props.getKeys();
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("ACCESS_TOKEN_") === 0) {
        const itemName = keys[i].replace("ACCESS_TOKEN_", "");
        try {
          const token = getAccessToken(itemName);
          if (token) {
            itemGet(token).then(function(d) {
              if (d.item && d.item.item_id) {
                props.setProperty("ITEMID_" + d.item.item_id, itemName);
              }
            });
          }
        } catch (e) {
          log("findItemNameByItemId", "item/get failed for " + itemName);
        }
      }
    }
    return cached || null;
  }
  function _refreshAllBalances() {
    const props = PropertiesService.getScriptProperties();
    const keys = props.getKeys();
    const all = [];
    const promises = [];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("ACCESS_TOKEN_") === 0) {
        const itemName = keys[i].replace("ACCESS_TOKEN_", "");
        promises.push(
          fetchBalances(itemName).then(function(b) {
            all.push.apply(all, b);
          }).catch(function(e) {
            log("refreshAllBalances", "Failed for " + itemName + ": " + (e.message || e));
          })
        );
      }
    }
    Promise.all(promises).then(function() {
      if (all.length > 0) writeBalances(all);
    });
  }
  var STALE_LOCK_MS = 5 * 60 * 1e3;
  function _tryAcquireRefreshLock() {
    const lock = LockService.getScriptLock();
    const gotIt = lock.tryLock(3e4);
    if (gotIt) {
      try {
        setProperty("LOCK_HELD_AT", (/* @__PURE__ */ new Date()).toISOString());
      } catch {
      }
      return true;
    }
    let heldAt = null;
    try {
      heldAt = getProperty("LOCK_HELD_AT");
    } catch {
    }
    if (heldAt) {
      const ageMs = Date.now() - new Date(heldAt).getTime();
      if (ageMs > STALE_LOCK_MS) {
        log("refreshLock", "Stale lock detected (" + Math.round(ageMs / 1e3) + "s old) \u2014 force-releasing.");
        try {
          lock.releaseLock();
        } catch {
        }
        if (lock.tryLock(1e3)) {
          try {
            setProperty("LOCK_HELD_AT", (/* @__PURE__ */ new Date()).toISOString());
          } catch {
          }
          return true;
        }
      }
    }
    log("refreshLock", "Another refresh is running \u2014 skipping this run.");
    return false;
  }
  function _releaseRefreshLock() {
    try {
      LockService.getScriptLock().releaseLock();
    } catch {
    }
    try {
      deleteProperty("LOCK_HELD_AT");
    } catch {
    }
  }
  globalThis.scheduledRefresh = function() {
    ensureTab2();
    log("scheduledRefresh", "=== Starting scheduled refresh ===");
    if (!_tryAcquireRefreshLock()) return Promise.resolve();
    return syncAllProductionAccounts().then(function() {
      return backfill("2026-01-01").catch(function(e) {
        error("scheduledRefresh(backfill)", e);
      });
    }).then(function() {
      return refresh();
    }).then(function() {
      log("scheduledRefresh", "=== Scheduled refresh complete ===");
      _releaseRefreshLock();
    }).catch(function(e) {
      error("scheduledRefresh", e);
      _releaseRefreshLock();
    });
  };
  globalThis._dashboardRefresh = refresh;
  globalThis._debugLog = log;
  globalThis._debugError = error;
  globalThis.syncAllProductionAccounts = syncAllProductionAccounts;
  globalThis.refreshAll = function() {
    if (!_tryAcquireRefreshLock()) return Promise.resolve();
    return refreshAll().then(function() {
      _releaseRefreshLock();
    }).catch(function(e) {
      _releaseRefreshLock();
      throw e;
    });
  };
  globalThis.resetAndResync = resetAndResync;
  globalThis.ensureTriggers = function() {
    const triggers = ScriptApp.getProjectTriggers();
    const ours = [];
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "scheduledRefresh") ours.push(triggers[i]);
    }
    if (ours.length === 2) {
      console.log("Triggers OK: 2x scheduledRefresh already installed");
      return;
    }
    for (let i = 0; i < ours.length; i++) {
      ScriptApp.deleteTrigger(ours[i]);
    }
    ScriptApp.newTrigger("scheduledRefresh").timeBased().everyDays(1).atHour(8).create();
    ScriptApp.newTrigger("scheduledRefresh").timeBased().everyDays(1).atHour(20).create();
    console.log("Created twice-daily scheduledRefresh triggers (8:00 + 20:00)");
  };
  globalThis.listTriggers = function() {
    const triggers = ScriptApp.getProjectTriggers();
    const names = [];
    for (let i = 0; i < triggers.length; i++) {
      names.push(triggers[i].getHandlerFunction() + " [" + triggers[i].getEventType() + "]");
    }
    console.log(names.length > 0 ? "Project triggers: " + names.join(", ") : "NO TRIGGERS INSTALLED");
    return names;
  };
  globalThis.cleanupTriggers = function() {
    const triggers = ScriptApp.getProjectTriggers();
    let deleted = 0;
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "scheduledRefresh") {
        ScriptApp.deleteTrigger(triggers[i]);
        deleted++;
      }
    }
    console.log("Deleted " + deleted + " scheduledRefresh trigger(s).");
    return deleted;
  };
  globalThis.forceReleaseLock = function() {
    try {
      LockService.getScriptLock().releaseLock();
      log("forceReleaseLock", "Script lock released.");
    } catch (e) {
      log("forceReleaseLock", "No lock held or already released: " + (e instanceof Error ? e.message : String(e)));
    }
    try {
      deleteProperty("LOCK_HELD_AT");
    } catch {
    }
    console.log("Lock force-released. Sync should work now.");
  };
  globalThis.configureWebhook = function() {
    const url = ScriptApp.getService().getUrl();
    PropertiesService.getScriptProperties().setProperty("WEBHOOK_URL", url);
    log("configureWebhook", "Webhook URL stored: " + url);
    const props = PropertiesService.getScriptProperties();
    const keys = props.getKeys();
    let updated = 0;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("ACCESS_TOKEN_") === 0) {
        const itemName = keys[i].replace("ACCESS_TOKEN_", "");
        const token = getAccessToken(itemName);
        if (token) {
          try {
            webhookUpdate(token, url);
            log("configureWebhook", "Updated webhook for: " + itemName);
            updated++;
          } catch (e) {
            error("configureWebhook", "Failed for " + itemName + ": " + (e.message || e));
          }
        }
      }
    }
    log("configureWebhook", "[OK] Updated " + updated + " item(s).");
  };
})();

// ==================== GAS simple triggers ====================
// Must be top-level function declarations, not inside the IIFE.
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var sheetName = sheet ? sheet.getName() : "none";
  var row = e.range.getRow();
  var col = e.range.getColumn();
  var log = function(msg) { return typeof _debugLog === "function" ? _debugLog("onEdit", msg) : Promise.resolve(); };
  var logError = function(err) { return typeof _debugError === "function" ? _debugError("onEdit", err) : Promise.resolve(); };
  // Log every edit so we can diagnose sheet names / trigger issues.
  return log("Edit event: sheet=" + sheetName + " row=" + row + " col=" + col).then(function() {
    if (!sheet) return;
    var nameLower = sheetName.toLowerCase();
    var isDashboard = nameLower.indexOf("dashboard") >= 0;
    var isAdjustments = nameLower.indexOf("adjustments") >= 0;
    if (!isDashboard && !isAdjustments) return;
    if (isDashboard && col === 2 && row === 2) {
      // B2 = "Refresh All" checkbox — triggers full sync (Plaid + calendar + savings + dashboard)
      return log("Full refresh triggered from dashboard B2").then(function() {
        if (typeof globalThis.refreshAll === "function") {
          return globalThis.refreshAll().catch(logError);
        }
      });
    }
    var shouldRefresh = false;
    if (isDashboard && col === 2) {
      // B4=month, B5=target, B15=include upcoming, B30=non-standard, B31=cancellations
      shouldRefresh = row === 4 || row === 5 || row === 15 || row === 30 || row === 31;
    }
    if (isAdjustments) {
      // Any edit in the adjustments tab should refresh the dashboard totals.
      shouldRefresh = true;
    }
    if (!shouldRefresh) return;
    return log("Recalc triggered from " + sheetName + " B" + row).then(function() {
      if (typeof _dashboardRefresh === "function") {
        return _dashboardRefresh().catch(logError);
      }
    });
  });
}

// ==================== UI-runnable wrappers ====================
// These delegate to the functions assigned to globalThis inside the IIFE.
function syncAllProductionAccounts() { if (globalThis.syncAllProductionAccounts) return globalThis.syncAllProductionAccounts(); }
function scheduledRefresh() { if (globalThis.scheduledRefresh) return globalThis.scheduledRefresh(); }
function refreshAll() { if (globalThis.refreshAll) return globalThis.refreshAll(); }
function resetAndResync() { if (globalThis.resetAndResync) return globalThis.resetAndResync(); }
function ensureTriggers() { if (globalThis.ensureTriggers) return globalThis.ensureTriggers(); }
function listTriggers() { if (globalThis.listTriggers) return globalThis.listTriggers(); }
function cleanupTriggers() { if (globalThis.cleanupTriggers) return globalThis.cleanupTriggers(); }
function forceReleaseLock() { if (globalThis.forceReleaseLock) return globalThis.forceReleaseLock(); }
