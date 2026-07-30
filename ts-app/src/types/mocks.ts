/**
 * mocks.ts — Lightweight mock factories for test data.
 *
 * Usage:
 *   const tx = mockedPlaidTransaction({ amount: 99.99 }).generate();
 *   const bal = mockedPlaidBalance({ name: 'Chase' }).generate();
 *   const result = mockedSyncResult({ added: [tx] }).generate();
 *
 * Every factory takes Partial<T> overrides and returns an object
 * with a .generate() method that produces the full typed object.
 */

import type {
  PlaidTransaction,
  PlaidBalance,
  SyncResult,
  CalendarEvent,
  RecurringItem,
  TransactionRow,
} from './index';

// ── Helpers ─────────────────────────────────────────────────────

let _counter = 0;
function nextId(prefix: string): string {
  return `mock-${prefix}-${++_counter}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Factories ───────────────────────────────────────────────────

export function mockedPlaidTransaction(overrides: Partial<PlaidTransaction> = {}) {
  return {
    generate(): PlaidTransaction {
      return {
        transaction_id: nextId('tx'),
        account_id: nextId('acct'),
        amount: 25.50,
        date: today(),
        name: 'Mock Transaction',
        merchant_name: 'Mock Merchant',
        ...overrides,
      };
    },
  };
}

export function mockedPlaidBalance(overrides: Partial<PlaidBalance> = {}) {
  return {
    generate(): PlaidBalance {
      return {
        name: 'Mock Account',
        type: 'depository',
        subtype: 'checking',
        available: 5000,
        current: 5000,
        iso_currency_code: 'USD',
        ...overrides,
      };
    },
  };
}

export function mockedSyncResult(overrides: Partial<SyncResult> = {}) {
  return {
    generate(): SyncResult {
      return {
        added: [],
        modified: [],
        removed: [],
        ...overrides,
      };
    },
  };
}

export function mockedCalendarEvent(overrides: Partial<CalendarEvent> = {}) {
  return {
    generate(): CalendarEvent {
      return {
        date: today(),
        title: 'Mock Event',
        status: 'Upcoming',
        ...overrides,
      };
    },
  };
}

export function mockedRecurringItem(overrides: Partial<RecurringItem> = {}) {
  return {
    generate(): RecurringItem {
      return {
        merchant: 'mock merchant',
        amount: 15,
        frequency: 'monthly',
        remaining: 1,
        upcomingAmount: 15,
        ...overrides,
      };
    },
  };
}

export function mockedTransactionRow(overrides: Partial<TransactionRow> = {}) {
  return {
    generate(): TransactionRow {
      return {
        account_name: 'Mock Account',
        date: today(),
        merchant_name: 'Mock Merchant',
        amount: 25.50,
        transaction_id: nextId('tx'),
        account_id: nextId('acct'),
        name: 'Mock Transaction',
        category: 'Shopping',
        payment_channel: 'online',
        pending: 'FALSE',
        currency: 'USD',
        synced_at: new Date().toISOString(),
        ...overrides,
      };
    },
  };
}
