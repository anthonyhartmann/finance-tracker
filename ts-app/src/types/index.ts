/**
 * types.ts — Shared type definitions for the finance tracker.
 */

/** A single cell value from Google Sheets. */
export type CellValue = string | number | boolean | null;

// ── Plaid ──────────────────────────────────────────────────────

/** Error response from Plaid API. */
export interface PlaidError {
  error_type: string;
  error_message: string;
}

/** POST /sandbox/public_token/create */
export interface PlaidPublicTokenResponse {
  public_token: string;
}

/** POST /item/public_token/exchange */
export interface PlaidExchangeResponse {
  access_token: string;
  item_id: string;
}

/** POST /transactions/sync */
export interface PlaidSyncResponse {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: PlaidTransaction[];
  next_cursor: string;
  has_more: boolean;
}

/** POST /accounts/get */
export interface PlaidAccountsResponse {
  accounts: PlaidAccount[];
}

/** POST /accounts/balance/get */
export interface PlaidBalanceResponse {
  accounts: Array<{
    name: string;
    type: string;
    subtype: string;
    balances: {
      available: number | null;
      current: number | null;
      iso_currency_code: string;
    };
  }>;
}

export interface PlaidCredentials {
  client_id: string;
  secret: string;
}

export interface PlaidTransaction {
  account_id: string;
  account_name?: string;
  amount: number;
  authorized_date?: string;
  date?: string;
  merchant_name?: string;
  name?: string;
  category?: string | string[];
  personal_finance_category?: { primary: string; detailed?: string };
  payment_channel?: string;
  pending?: boolean | string;
  currency?: string;
  iso_currency_code?: string;
  transaction_id: string;
  synced_at?: string;
  _account_name?: string;
  _account_subtype?: string;
}

export interface SyncResult {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: PlaidTransaction[];
}

export interface PlaidAccount {
  account_id: string;
  name: string;
  mask?: string;
  type: string;
  subtype: string;
  balances: {
    available: number | null;
    current: number | null;
    iso_currency_code: string;
  };
}

export interface PlaidBalance {
  name: string;
  type: string;
  subtype: string;
  available: number | null;
  current: number | null;
  iso_currency_code: string;
}

export interface CalendarEvent {
  date: string;
  title: string;
  status: 'Past' | 'Upcoming';
}

export interface RecurringItem {
  merchant: string;
  amount: number;
  frequency: string;
  remaining: number;
  upcomingAmount: number;
}

export interface RecurringResult {
  upcoming: number;
  items: RecurringItem[];
}

export interface TransactionRow {
  account_name: string;
  date: string;
  merchant_name: string;
  amount: number;
  transaction_id: string;
  account_id: string;
  name: string;
  category: string;
  payment_channel: string;
  pending: string;
  currency: string;
  synced_at: string;
}

/** POST /transactions/get (date-range paginated) */
export interface PlaidTransactionsGetResponse {
  accounts: PlaidAccount[];
  transactions: PlaidTransaction[];
  total_transactions: number;
}

/** POST /investments/transactions/get */
export interface PlaidInvestmentTransactionsGetResponse {
  accounts: PlaidAccount[];
  investment_transactions: PlaidInvestmentTransaction[];
  total_investment_transactions: number;
}

export interface PlaidInvestmentTransaction {
  account_id: string;
  amount: number;
  date: string;
  name?: string;
  merchant_name?: string;
  subtype?: string;
  type?: string;
  investment_transaction_id: string;
  security_id?: string;
  price?: number;
  quantity?: number;
  fees?: number;
}

export interface SavingsMonthData {
  month: string;
  net_savings: number;
  transfers_auto: number;
  retirement_auto: number;
  ally_auto: number;
  manual_transfers: number;
  manual_retirement: number;
  manual_ally_out: number;
  details: string[];
}
