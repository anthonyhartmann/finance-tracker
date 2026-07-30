/**
 * plaid.ts — Plaid API integration. Replaces Plaid.gs.
 */

import * as config from '../config';
import * as Debug from '../debug';
import { http } from '../adapter';
import type {
  SyncResult, PlaidBalance, PlaidAccount, PlaidTransaction,
  PlaidError, PlaidSyncResponse, PlaidAccountsResponse,
  PlaidBalanceResponse, PlaidPublicTokenResponse, PlaidExchangeResponse,
  PlaidTransactionsGetResponse, PlaidInvestmentTransactionsGetResponse,
  PlaidInvestmentTransaction,
} from '../types';

export function getSyncStartDate(): string {
  return config.getProperty('SYNC_START_DATE') || '2026-07-01';
}

export function baseUrl(): string {
  const env = config.getProperty('PLAID_ENVIRONMENT') || 'sandbox';
  return env === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com';
}

export function creds(): { client_id: string | null; secret: string | null } {
  return {
    client_id: config.getProperty('PLAID_CLIENT_ID'),
    secret: config.getProperty('PLAID_SECRET'),
  };
}

/** Generic Plaid POST. Callers supply the expected response shape. */
export async function post<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const c = creds();
  const body = { ...payload, client_id: c.client_id, secret: c.secret };
  const url = baseUrl() + endpoint;

  await Debug.log('Plaid._post', 'POST ' + url);

  const { status, data } = await http.postJson(url, body);

  await Debug.log('Plaid._post', 'Response: ' + status);

  const result = data as PlaidError & T;
  if (result.error_type) {
    await Debug.log('Plaid._post', 'ERROR: ' + result.error_type + ' - ' + result.error_message);
    throw new Error(result.error_type + ': ' + result.error_message);
  }

  return result;
}

export async function sandboxCreatePublicToken(): Promise<string> {
  await Debug.log('Plaid.sandboxCreatePublicToken', 'Creating sandbox public token...');
  const data = await post<PlaidPublicTokenResponse>('/sandbox/public_token/create', {
    institution_id: 'ins_109508',
    initial_products: ['transactions'],
    options: { webhook: config.getProperty('WEBHOOK_URL') || '' },
  });
  await Debug.log('Plaid.sandboxCreatePublicToken', 'public_token generated');
  return data.public_token;
}

export async function exchangePublicToken(publicToken: string): Promise<string> {
  await Debug.log('Plaid.exchangePublicToken', 'Exchanging public token...');
  const data = await post<PlaidExchangeResponse>('/item/public_token/exchange', { public_token: publicToken });
  await Debug.log('Plaid.exchangePublicToken', 'access_token stored');
  await Debug.log('Plaid.exchangePublicToken', 'item_id: ' + data.item_id);
  return data.access_token;
}

export function getAccessToken(itemName: string): string | null {
  return config.getProperty('ACCESS_TOKEN_' + itemName);
}

export function storeAccessToken(itemName: string, token: string): void {
  config.setProperty('ACCESS_TOKEN_' + itemName, token);
}

export async function syncTransactions(itemName: string): Promise<SyncResult> {
  await Debug.log('Plaid.syncTransactions', 'Starting sync for: ' + itemName);
  const accessToken = getAccessToken(itemName);
  if (!accessToken) {
    throw new Error('No access token found for: ' + itemName);
  }

  const cursorKey = 'CURSOR_' + itemName;
  let cursor = config.getProperty(cursorKey) || '';

  const result: SyncResult = { added: [], modified: [], removed: [] };
  let hasMore = true;
  let skippedOld = 0;
  const syncStartDate = getSyncStartDate();

  while (hasMore) {
    const data = await post<PlaidSyncResponse>('/transactions/sync', {
      access_token: accessToken,
      cursor: cursor,
      count: 100,
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

    cursor = data.next_cursor || '';
    hasMore = data.has_more || false;
  }

  config.setProperty(cursorKey, cursor);

  // ── Cursor validation ───────────────────────────────────────────
  // The cursor-based /transactions/sync can silently miss transactions if
  // the cursor was advanced past them (e.g. by a parallel run that beat us
  // to the write, or a webhook that updated the cursor out-of-band). To
  // detect this, fetch a recent 7-day window via the non-cursor
  // /transactions/get API and check whether Plaid has transactions we never
  // received. If so, the cursor is stale: merge the missing transactions in
  // and delete the cursor so the next sync rebuilds it from a clean state.
  const repairedCursor = await validateAndRepairCursor(itemName, accessToken, cursorKey, syncStartDate, result);

  // ── Bank-freshness guard ──────────────────────────────────────────
  // Some banks (especially BofA) report successful syncs but silently
  // stall new-transaction delivery. /transactions/refresh forces a
  // fresh pull. Fire it when a sync returns zero new/updated/removed
  // AND no cursor repair happened AND the last refresh was >6 hours ago.
  const totalChanges = result.added.length + result.modified.length + result.removed.length;
  if (totalChanges === 0 && !repairedCursor) {
    const lastRefreshKey = 'LAST_REFRESH_' + itemName;
    const lastRefresh = config.getProperty(lastRefreshKey) || '';
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    if (!lastRefresh || lastRefresh < sixHoursAgo) {
      try {
        await post('/transactions/refresh', { access_token: accessToken });
        config.setProperty(lastRefreshKey, new Date().toISOString());
        await Debug.log('Plaid.transactionsRefresh', itemName + ': forced refresh — item returned 0 changes');
      } catch (e: unknown) {
        await Debug.error('Plaid.transactionsRefresh', itemName + ' refresh failed: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
  }

  await Debug.log('Plaid.syncTransactions', itemName + ': ' + result.added.length + ' new, ' + result.modified.length + ' updated, ' + result.removed.length + ' removed (' + skippedOld + ' old skipped, before ' + syncStartDate + ')');
  return result;
}

/**
 * Detect a stale cursor by comparing the cursor-sync results against a
 * recent 7-day window from /transactions/get. If Plaid has transactions in
 * that window that the cursor sync never delivered, the cursor is desynced:
 * we merge the missing ones into `result.added` and delete the stored cursor
 * so the next sync rebuilds it cleanly.
 */
async function validateAndRepairCursor(
  itemName: string,
  accessToken: string,
  cursorKey: string,
  syncStartDate: string,
  result: SyncResult,
): Promise<boolean> {
  // Build the set of transaction_ids the cursor sync already gave us.
  const seenIds = new Set<string>();
  for (const t of result.added) seenIds.add(String(t.transaction_id));
  for (const t of result.modified) seenIds.add(String(t.transaction_id));

  // Fetch a recent 7-day window (non-cursor date-range query).
  const tz = 'America/New_York';
  const today = new Date();
  const windowEnd = today.toLocaleDateString('en-CA', { timeZone: tz });
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowStart = weekAgo.toLocaleDateString('en-CA', { timeZone: tz });

  let recent: PlaidTransaction[];
  try {
    recent = await transactionsGet(accessToken, windowStart, windowEnd);
  } catch (e: unknown) {
    // If the date-range fetch fails, don't block the sync — just skip
    // validation this round. The cursor sync result is still valid.
    await Debug.log('Plaid.validateCursor', itemName + ': date-range fetch failed (' + (e instanceof Error ? e.message : String(e)) + '), skipping cursor validation');
    return false;
  }

  // Filter to the sync start date (same window as the cursor sync).
  const missing: PlaidTransaction[] = [];
  for (const t of recent) {
    if (syncStartDate && t.date && t.date < syncStartDate) continue;
    if (!seenIds.has(String(t.transaction_id))) {
      missing.push(t);
    }
  }

  if (missing.length === 0) {
    // Cursor is healthy — no repair needed.
    return false;
  }

  // Cursor is stale: Plaid has transactions the cursor sync skipped.
  await Debug.error('Plaid.validateCursor', itemName + ': STALE CURSOR detected — ' + missing.length + ' transaction(s) in the last 7 days were missed by /transactions/sync. Resetting cursor and merging missing tx.');

  // Merge the missing transactions into result.added. writeTransactions
  // already dedupes by transaction_id against existing sheet rows, so
  // re-adding them is safe.
  for (const t of missing) {
    result.added.push(t);
  }

  // Delete the cursor so the next sync rebuilds it from scratch.
  config.deleteProperty(cursorKey);
  await Debug.log('Plaid.validateCursor', itemName + ': cursor deleted (CURSOR_' + itemName + '). Next sync will rebuild it.');
  return true;
}

export async function getAccounts(itemName: string): Promise<PlaidAccount[]> {
  const accessToken = getAccessToken(itemName);
  const data = await post<PlaidAccountsResponse>('/accounts/get', { access_token: accessToken });
  await Debug.log('Plaid.getAccounts', 'Accounts: ' + JSON.stringify(data.accounts.map((a) => ({ id: a.account_id, name: a.name, type: a.type, subtype: a.subtype }))));
  return data.accounts;
}

export async function getAccountNames(accountIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const missing: string[] = [];

  for (const id of accountIds) {
    if (!id) continue;
    const cached = config.getProperty('ACCT_' + id);
    if (cached) {
      map[id] = cached;
    } else if (!missing.includes(id)) {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    const keys = config.getKeys();
    for (const k of keys) {
      if (!k.startsWith('ACCESS_TOKEN_')) continue;
      try {
        const data = await post<PlaidAccountsResponse>('/accounts/get', { access_token: config.getProperty(k) });
        for (const acct of data.accounts) {
          const label = acct.name + (acct.mask ? ' \u2022' + acct.mask : '');
          config.setProperty('ACCT_' + acct.account_id, label);
          const mi = missing.indexOf(acct.account_id);
          if (mi >= 0) {
            map[acct.account_id] = label;
            missing.splice(mi, 1);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await Debug.log('Plaid.getAccountNames', 'accounts/get failed for ' + k + ': ' + msg);
      }
      if (missing.length === 0) break;
    }
  }
  return map;
}

export async function fetchBalances(itemName: string): Promise<PlaidBalance[]> {
  await Debug.log('Plaid.fetchBalances', 'Fetching balances for: ' + itemName);
  const accessToken = getAccessToken(itemName);
  const data = await post<PlaidBalanceResponse>('/accounts/balance/get', { access_token: accessToken });

  const balances: PlaidBalance[] = [];
  for (const a of data.accounts) {
    const bal: PlaidBalance = {
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      available: a.balances.available,
      current: a.balances.current,
      iso_currency_code: a.balances.iso_currency_code,
    };
    balances.push(bal);
    await Debug.log('Plaid.fetchBalances', bal.name + ' (' + bal.type + '): available=' + bal.available + ' current=' + bal.current);
  }
  return balances;
}

export async function itemGet(accessToken: string): Promise<Record<string, unknown>> {
  return post('/item/get', { access_token: accessToken });
}

export async function institutionsGetById(institutionId: string): Promise<Record<string, unknown>> {
  return post('/institutions/get_by_id', { institution_id: institutionId, country_codes: ['US'] });
}

export async function webhookUpdate(accessToken: string, webhookUrl: string): Promise<Record<string, unknown>> {
  return post('/item/webhook/update', { access_token: accessToken, webhook: webhookUrl });
}

export async function userCreate(clientUserId: string): Promise<Record<string, unknown>> {
  return post('/user/create', { client_user_id: clientUserId });
}

export async function linkTokenCreate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return post('/link/token/create', payload);
}

export async function transactionsGet(
  accessToken: string,
  startDate: string,
  endDate: string,
  accountMap?: Record<string, { name: string; subtype: string }>
): Promise<PlaidTransaction[]> {
  await Debug.log('Plaid.transactionsGet', 'Fetching transactions ' + startDate + ' -> ' + endDate);

  let all: PlaidTransaction[] = [];
  let page = 0;
  const pageSize = 500;
  let hasMore = true;

  while (hasMore) {
    const data = await post<PlaidTransactionsGetResponse>('/transactions/get', {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { offset: page * pageSize, count: pageSize },
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

  await Debug.log('Plaid.transactionsGet', 'Fetched ' + all.length + ' transactions');
  return all;
}

export async function investmentTransactionsGet(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<PlaidInvestmentTransaction[]> {
  await Debug.log('Plaid.investmentTransactionsGet', 'Fetching investment transactions ' + startDate + ' -> ' + endDate);

  let all: PlaidInvestmentTransaction[] = [];
  let page = 0;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const data = await post<PlaidInvestmentTransactionsGetResponse>('/investments/transactions/get', {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { offset: page * pageSize, count: pageSize },
    });

    const txList = data.investment_transactions || [];
    all = all.concat(txList);
    hasMore = txList.length === pageSize;
    page++;
  }

  await Debug.log('Plaid.investmentTransactionsGet', 'Fetched ' + all.length + ' investment transactions');
  return all;
}

export async function linkTokenGet(linkToken: string): Promise<Record<string, unknown>> {
  return post('/link/token/get', { link_token: linkToken });
}
