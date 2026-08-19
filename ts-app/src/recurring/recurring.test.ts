/**
 * recurring.test.ts — Tests for upcoming bills calculation.
 */

jest.mock('../sheet-api');
jest.mock('../debug');

import * as sheetApi from '../sheet-api';
import * as Debug from '../debug';
import { calculateUpcoming } from './index';

const mockSheetApi = jest.mocked(sheetApi);

beforeEach(() => {
  jest.clearAllMocks();
  Debug.log.mockResolvedValue(undefined);
  Debug.error.mockResolvedValue(undefined);
});

describe('recurring', () => {
  describe('calculateUpcoming', () => {
    it('returns 0 for empty recurring tab', async () => {
      mockSheetApi.getValues.mockResolvedValueOnce([['header']]);
      const result = await calculateUpcoming(2026, 7, new Date('2026-07-15'));
      expect(result.upcoming).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('calculates expected monthly bills not yet posted', async () => {
      // Recurring tab has Netflix $15/month
      mockSheetApi.getValues
        .mockResolvedValueOnce([  // recurring tab
          ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'],
          ['Netflix', 15, 'monthly', '15', 'streaming'],
        ])
        .mockResolvedValueOnce([  // transactions tab (no Netflix transactions yet)
          ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ]);

      const result = await calculateUpcoming(2026, 7, new Date('2026-07-15'));
      // No Netflix transaction found, so remaining = 1, upcoming = $15
      expect(result.upcoming).toBe(15);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].merchant).toBe('netflix');
      expect(result.items[0].upcomingAmount).toBe(15);
    });

    it('reduces upcoming when transaction already posted', async () => {
      mockSheetApi.getValues
        .mockResolvedValueOnce([  // recurring tab
          ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'],
          ['Netflix', 15, 'monthly', '15', 'streaming'],
        ])
        .mockResolvedValueOnce([  // transactions tab (Netflix already posted)
          ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
          ['Chase', '2026-07-15', 'Netflix', -15, 't1', 'a1', 'Netflix Subscription', 'Entertainment', 'online', 'FALSE', 'USD', 'now'],
        ]);

      const result = await calculateUpcoming(2026, 7, new Date('2026-07-15'));
      // Netflix already posted, so remaining = 0, upcoming = $0
      expect(result.upcoming).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('handles weekly frequency (expected 4 per month)', async () => {
      mockSheetApi.getValues
        .mockResolvedValueOnce([  // recurring tab
          ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'],
          ['Coffee Shop', 5, 'weekly', '', 'morning coffee'],
        ])
        .mockResolvedValueOnce([  // transactions tab (1 of 4 posted)
          ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
          ['Chase', '2026-07-05', 'Coffee Shop', -5, 't1', 'a1', 'Coffee', 'Food', 'in store', 'FALSE', 'USD', 'now'],
        ]);

      const result = await calculateUpcoming(2026, 7, new Date('2026-07-15'));
      // 4 expected - 1 posted = 3 remaining * $5 = $15
      expect(result.upcoming).toBe(15);
      expect(result.items[0].remaining).toBe(3);
    });

    it('skips bills with no merchant or zero amount', async () => {
      mockSheetApi.getValues
        .mockResolvedValueOnce([
          ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'],
          ['', 10, 'monthly', '1', 'empty merchant'],
          ['Valid Bill', 0, 'monthly', '1', 'zero amount'],
        ])
        .mockResolvedValueOnce([['header']]);

      const result = await calculateUpcoming(2026, 7, new Date('2026-07-15'));
      expect(result.upcoming).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('handles missing required columns', async () => {
      mockSheetApi.getValues.mockResolvedValueOnce([['wrong', 'headers', 'here']]);
      const result = await calculateUpcoming(2026, 7, new Date('2026-07-15'));
      expect(result.upcoming).toBe(0);
    });
  });
});



describe('recurring edge cases', () => {
  it('handles Date objects from GAS sheets (posted bill should not show as upcoming)', async () => {
    mockSheetApi.getValues
      .mockResolvedValueOnce([  // recurring tab
        ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'],
        ['Verizon Fios', '49.99', 'monthly', '15', 'internet', 'verizon'],
      ])
      .mockResolvedValueOnce([  // transactions tab - Verizon already paid, but as Date object
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ['Chase', new Date('2026-07-15'), 'Verizon Fios', -49.99, 't1', 'a1', 'Verizon Fios', 'GENERAL_SERVICES', 'online', 'FALSE', 'USD', 'now'],
      ]);

    const result = await calculateUpcoming(2026, 7, new Date('2026-07-26'));
    // Verizon already posted this month, so upcoming should be $0
    expect(result.upcoming).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('matches token so Verizon Fios bill matches Verizon transaction', async () => {
    mockSheetApi.getValues
      .mockResolvedValueOnce([  // recurring tab
        ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'],
        ['Verizon Fios', '49.99', 'monthly', '15', 'internet', 'verizon'],
      ])
      .mockResolvedValueOnce([  // transactions: merchant is just Verizon, not Verizon Fios
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ['Adv Plus Banking', '2026-07-06', 'Verizon', '49.99', 't1', 'a1', 'VERIZON DES:PAYMENTREC', 'GENERAL_SERVICES', 'online', 'FALSE', 'USD', 'now'],
      ]);

    const result = await calculateUpcoming(2026, 7, new Date('2026-07-28'));
    expect(result.upcoming).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('does not falsely match "Con Edison" with unrelated "Consolidated" transaction', async () => {
    mockSheetApi.getValues
      .mockResolvedValueOnce([  // recurring tab
        ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'],
        ['Con Edison', 122, 'monthly', '20', 'electric', 'coned'],
      ])
      .mockResolvedValueOnce([  // transactions tab: has "Consolidated", but NOT Con Edison
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ['Checking', '2026-07-10', 'Consolidated Store', 50, 't1', 'a1', 'Consolidated Store', 'SHOPPING', 'in store', 'FALSE', 'USD', 'now'],
      ]);

    const result = await calculateUpcoming(2026, 7, new Date('2026-07-15'));
    // Con Edison has not posted yet, so upcoming should be $122
    expect(result.upcoming).toBe(122);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].merchant).toBe('con edison');
  });

  it('correctly matches "Con Edison" when a real Con Edison transaction exists', async () => {
    mockSheetApi.getValues
      .mockResolvedValueOnce([  // recurring tab
        ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'],
        ['Con Edison', 122, 'monthly', '20', 'electric', 'coned'],
      ])
      .mockResolvedValueOnce([  // transactions tab: has actual Con Ed payment
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        ['Checking', '2026-07-12', 'CONED ONLINE PMT', 122, 't1', 'a1', 'CON EDISON OF NY', 'UTILITIES', 'online', 'FALSE', 'USD', 'now'],
      ]);

    const result = await calculateUpcoming(2026, 7, new Date('2026-07-15'));
    // Con Edison posted, so upcoming should be $0
    expect(result.upcoming).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('counts every posted recurring bill so upcoming only reflects unpaid bills', async () => {
    // User's recurring tab
    mockSheetApi.getValues
      .mockResolvedValueOnce([
        ['merchant_name', 'amount', 'frequency', 'day_of_month', 'notes', 'match_token'],
        ['Apple', 14.99, 'monthly', '', '', ''],
        ['DigitalOcean', 5.01, 'monthly', '', '', ''],
        ['New York Times', 4, 'monthly', '', '', ''],
        ['Patreon', 10, 'monthly', '', '', ''],
        ['Planet Fitness', 31.38, 'monthly', '', '', ''],
        ['Rocket Money', 6.53, 'monthly', '', '', ''],
        ['Con Edison', 122.73, 'monthly', '', '', ''],
        ['Google Fi', 85.9, 'monthly', '', '', ''],
        ['Lemonade', 9.92, 'monthly', '', '', ''],
        ['Verizon Fios', 49.99, 'monthly', '', '', 'verizon'],
        ['ActBlue', 15, 'monthly', '', '', ''],
        ['Democratic Socialists', 15, 'monthly', '', '', ''],
        ['Headway', 20, 'weekly', '', '', ''],
      ])
      .mockResolvedValueOnce([
        ['account_name', 'date', 'merchant_name', 'amount', 'transaction_id', 'account_id', 'name', 'category', 'payment_channel', 'pending', 'currency', 'synced_at'],
        // Posted recurring bills in August
        ['CREDIT CARD', '2026-08-05', 'Apple', -14.99, 't1', 'a1', 'APPLE.COM/BILL', 'ENTERTAINMENT', 'online', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-01', 'Digitalocean', -5.01, 't2', 'a1', 'DIGITALOCEAN.COM', 'GENERAL_SERVICES', 'online', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-14', 'Patreon', -5, 't3', 'a1', 'Patreon* Membership', 'ENTERTAINMENT', 'online', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-17', 'Planet Fitness', -31.38, 't4', 'a1', 'Planet Fitness', 'PERSONAL_CARE', 'in store', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-01', 'Google Fi', -86.05, 't5', 'a1', 'FI 6T469K', 'RENT_AND_UTILITIES', 'online', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-06', 'Verizon', -49.99, 't6', 'a1', 'VERIZON DES:PAYMENTREC', 'GENERAL_SERVICES', 'online', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-18', 'ActBlue', -15, 't7', 'a1', 'ACTBLUE* NEW.YORK.CITY', 'GOVERNMENT_AND_NON_PROFIT', 'online', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-07', 'Democratic Socialists Of', -15, 't8', 'a1', 'DEMOCRATIC SOCIALISTS OF', 'GOVERNMENT_AND_NON_PROFIT', 'in store', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-02', 'Headway', -20, 't9', 'a1', 'HEADWAY', 'PERSONAL_CARE', 'in store', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-10', 'Headway', -20, 't10', 'a1', 'HEADWAY', 'PERSONAL_CARE', 'in store', 'FALSE', 'USD', 'now'],
        ['CREDIT CARD', '2026-08-15', 'Headway', -20, 't11', 'a1', 'HEADWAY', 'PERSONAL_CARE', 'in store', 'FALSE', 'USD', 'now'],
      ]);

    const result = await calculateUpcoming(2026, 8, new Date('2026-08-19'));
    // Should only count unpaid bills:
    // NYT ($4) + Rocket Money ($6.53) + Con Edison ($122.73) + Lemonade ($9.92) + Headway 1 remaining ($20)
    // = $163.18
    expect(result.upcoming).toBeCloseTo(163.18);
  });
});