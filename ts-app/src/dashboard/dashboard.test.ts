/**
 * dashboard.test.ts — Tests for dashboard calculations.
 */

jest.mock('../sheet-api');
jest.mock('../debug');
jest.mock('../recurring');
jest.mock('../config');

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import * as RECURRING from '../recurring';
import { calculateSpend, calculateInterviewIncome, calculateManualAdjustments } from './index';

const mockSheetApi = jest.mocked(sheetApi);
const mockDebug = jest.mocked(Debug);
const mockRecurring = jest.mocked(RECURRING);

beforeEach(() => {
  jest.clearAllMocks();
  mockDebug.log.mockResolvedValue(undefined);
  mockDebug.error.mockResolvedValue(undefined);
  mockRecurring.calculateUpcoming.mockResolvedValue({ upcoming: 0, items: [] });
});

describe('calculateManualAdjustments', () => {
  it('sums adjustments in date range with YYYY-MM-DD format', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['date', 'description', 'amount'],
      ['2026-07-05', 'Refund 1', '50'],
      ['2026-07-16', 'Refund 2', '40'],
      ['2026-06-20', 'Old refund', '100'],
    ]);

    const result = await calculateManualAdjustments('2026-07-01', '2026-07-31');
    expect(result).toBe(90);
  });

  it('ignores adjustments with wrong date format (like Jul 5)', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['date', 'description', 'amount'],
      ['Jul 5', 'Refund 1', '50'],
      ['Jul 16', 'Refund 2', '40'],
      ['2026-07-20', 'Valid refund', '60'],
    ]);

    const result = await calculateManualAdjustments('2026-07-01', '2026-07-31');
    // Only the YYYY-MM-DD format entry should count
    expect(result).toBe(60);
  });

  it('handles negative amounts', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['date', 'description', 'amount'],
      ['2026-07-05', 'Refund', '50'],
      ['2026-07-10', 'Correction', '-20'],
    ]);

    const result = await calculateManualAdjustments('2026-07-01', '2026-07-31');
    expect(result).toBe(30);
  });

  it('handles Date objects from GAS sheets', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['date', 'description', 'amount'],
      [new Date('2026-07-05'), 'Refund 1', '50'],
      [new Date('2026-07-16'), 'Refund 2', '40'],
      [new Date('2026-06-20'), 'Old refund', '100'],
    ]);

    const result = await calculateManualAdjustments('2026-07-01', '2026-07-31');
    expect(result).toBe(90);
  });

  it('returns 0 when no adjustments exist', async () => {
    mockSheetApi.getValues.mockResolvedValue([]);
    const result = await calculateManualAdjustments('2026-07-01', '2026-07-31');
    expect(result).toBe(0);
  });
});

describe('calculateSpend', () => {
  it('sums positive amounts for transactions in date range', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
      ['Chase', '2026-07-15', 'Coffee', '5.50', 'tx1', 'acct1', 'Coffee', 'FOOD', 'in store', 'FALSE', 'USD', '2026-07-15'],
      ['Chase', '2026-07-20', 'Grocery', '50.00', 'tx2', 'acct1', 'Grocery', 'FOOD', 'in store', 'FALSE', 'USD', '2026-07-20'],
      ['Chase', '2026-06-15', 'Old purchase', '100.00', 'tx3', 'acct1', 'Old', 'OTHER', 'in store', 'FALSE', 'USD', '2026-06-15'],
    ]);

    const result = await calculateSpend('2026-07-01', '2026-07-31');
    expect(result).toBe(55.50);
  });

  it('excludes transfers by category', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
      ['Chase', '2026-07-15', 'Transfer to Savings', '500.00', 'tx1', 'acct1', 'Transfer', 'TRANSFER', 'in store', 'FALSE', 'USD', '2026-07-15'],
      ['Chase', '2026-07-20', 'Coffee', '5.50', 'tx2', 'acct1', 'Coffee', 'FOOD', 'in store', 'FALSE', 'USD', '2026-07-20'],
    ]);

    const result = await calculateSpend('2026-07-01', '2026-07-31');
    expect(result).toBe(5.50);
  });

  it('excludes transfers by name', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
      ['Chase', '2026-07-15', 'Savings', '500.00', 'tx1', 'acct1', 'Transfer to savings account', 'SAVINGS', 'in store', 'FALSE', 'USD', '2026-07-15'],
      ['Chase', '2026-07-20', 'Coffee', '5.50', 'tx2', 'acct1', 'Coffee', 'FOOD', 'in store', 'FALSE', 'USD', '2026-07-20'],
    ]);

    const result = await calculateSpend('2026-07-01', '2026-07-31');
    expect(result).toBe(5.50);
  });

  it('excludes negative amounts (refunds)', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
      ['Chase', '2026-07-15', 'Coffee', '5.50', 'tx1', 'acct1', 'Coffee', 'FOOD', 'in store', 'FALSE', 'USD', '2026-07-15'],
      ['Chase', '2026-07-20', 'Refund', '-10.00', 'tx2', 'acct1', 'Refund', 'OTHER', 'online', 'FALSE', 'USD', '2026-07-20'],
    ]);

    const result = await calculateSpend('2026-07-01', '2026-07-31');
    expect(result).toBe(5.50);
  });

  it('handles Date objects from GAS sheets', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
      ['Chase', new Date('2026-07-15'), 'Coffee', '5.50', 'tx1', 'acct1', 'Coffee', 'FOOD', 'in store', 'FALSE', 'USD', '2026-07-15'],
      ['Chase', new Date('2026-07-20'), 'Grocery', '50.00', 'tx2', 'acct1', 'Grocery', 'FOOD', 'in store', 'FALSE', 'USD', '2026-07-20'],
    ]);

    const result = await calculateSpend('2026-07-01', '2026-07-31');
    expect(result).toBe(55.50);
  });

  it('returns 0 when no transactions exist', async () => {
    mockSheetApi.getValues.mockResolvedValue([]);
    const result = await calculateSpend('2026-07-01', '2026-07-31');
    expect(result).toBe(0);
  });
});

describe('calculateInterviewIncome', () => {
  const mockDashboard = [
    ['Finance Tracker Dashboard', ''],
    ['Refresh All', ''],
    ['Controls', ''],
    ['Month (YYYY-MM)', '2026-07'],
    ['Monthly Target', '4000'],
    ['', ''],
    ['The 3 Numbers', ''],
    ['Actual Spend', ''],
    ['Interview Income', ''],
    ['Manual Adjustments', ''],
    ['Net Income', ''],
    ['', ''],
    ['Daily Budget', ''],
    ['Upcoming Bills (unpaid)', ''],
    ['Include Upcoming in Spend', '1'],
    ['', ''],
    ['Savings Summary', ''],
    ['Total Saved', ''],
    ['Avg Monthly Savings', ''],
    ['Months Saved', ''],
    ['', ''],
    ['Interview Settings', ''],
    ['Standard Rate ($)', '85'],
    ['Non-Standard Rate ($)', '115'],
    ['Cancellation Rate ($)', '75'],
    ['Tax Scalar', '0.7'],
    ['Count Upcoming Interviews', '1'],
    ['', ''],
    ['Manual Inputs (resets monthly)', ''],
    ['# Non-Standard Interviews', '0'],
    ['# Late Cancellations', '0'],
  ];

  it('calculates income for interviews in the specified month', async () => {
    mockSheetApi.getValues
      .mockResolvedValueOnce([
        ['date', 'title', 'status'],
        ['2026-07-10', 'Interview with Alice', 'Past'],
        ['2026-07-15', 'Interview with Bob', 'Upcoming'],
        ['2026-06-20', 'Interview with Charlie', 'Past'],
      ])
      .mockResolvedValueOnce(mockDashboard);

    const result = await calculateInterviewIncome('2026-07');
    // 2 interviews * $85 * 0.7 tax = $119
    expect(result).toBe(119);
  });

  it('applies non-standard and cancellation rates', async () => {
    const customDashboard = [...mockDashboard];
    customDashboard[29] = ['# Non-Standard Interviews', '1'];
    customDashboard[30] = ['# Late Cancellations', '1'];

    mockSheetApi.getValues
      .mockResolvedValueOnce([
        ['date', 'title', 'status'],
        ['2026-07-10', 'Interview 1', 'Past'],
        ['2026-07-15', 'Interview 2', 'Past'],
        ['2026-07-20', 'Interview 3', 'Past'],
      ])
      .mockResolvedValueOnce(customDashboard);

    const result = await calculateInterviewIncome('2026-07');
    // 3 total - 1 nonstd - 1 cancel = 1 standard
    // (1 * $85) + (1 * $115) + (1 * $75) = $275 * 0.7 = $192.50
    expect(result).toBe(192.50);
  });

  it('excludes upcoming interviews when Count Upcoming is 0', async () => {
    const customDashboard = [...mockDashboard];
    customDashboard[26] = ['Count Upcoming Interviews', '0'];

    mockSheetApi.getValues
      .mockResolvedValueOnce([
        ['date', 'title', 'status'],
        ['2026-07-10', 'Interview 1', 'Past'],
        ['2026-07-15', 'Interview 2', 'Upcoming'],
      ])
      .mockResolvedValueOnce(customDashboard);

    const result = await calculateInterviewIncome('2026-07');
    // Only 1 past interview * $85 * 0.7 = $59.50
    expect(result).toBe(59.50);
  });

  it('returns 0 when no interview data exists', async () => {
    mockSheetApi.getValues.mockResolvedValue([]);
    const result = await calculateInterviewIncome('2026-07');
    expect(result).toBe(0);
  });
});

  it('excludes LOAN_PAYMENTS (credit card payments are transfers, not spend)', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
      ['Chase', '2026-07-06', 'Credit Card Payment', '3015.20', 'tx1', 'acct1', 'CHASE CREDIT CRD DES:EPAY', 'LOAN_PAYMENTS', 'online', 'FALSE', 'USD', '2026-07-06'],
      ['Chase', '2026-07-20', 'Coffee', '5.50', 'tx2', 'acct1', 'Coffee', 'FOOD', 'in store', 'FALSE', 'USD', '2026-07-20'],
    ]);

    const result = await calculateSpend('2026-07-01', '2026-07-31');
    expect(result).toBe(5.50);
  });

  it('counts TRANSFER_OUT as spend (Zelle to people is real spend, not self-transfer)', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
      ['Chase', '2026-07-06', 'Zelle', '3250.00', 'tx1', 'acct1', 'Zelle payment to JANE TIMM', 'TRANSFER_OUT', 'online', 'FALSE', 'USD', '2026-07-06'],
      ['Chase', '2026-07-20', 'Coffee', '5.50', 'tx2', 'acct1', 'Coffee', 'FOOD_AND_DRINK', 'in store', 'FALSE', 'USD', '2026-07-20'],
    ]);

    const result = await calculateSpend('2026-07-01', '2026-07-31');
    // TRANSFER_OUT is a payment to another person, not a self-transfer — counts as spend
    expect(result).toBe(3255.50);
  });
