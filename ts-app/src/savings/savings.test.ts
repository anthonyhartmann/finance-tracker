/**
 * savings.test.ts — Tests for savings tracker.
 */

jest.mock('../debug');
jest.mock('../sheet-api');
jest.mock('../plaid');

import * as Debug from '../debug';
import * as sheetApi from '../sheet-api';
import * as PLAID from '../plaid';
import {
  buildMonthMap, getCategory, isExcluded,
  writeSheet, readExisting, populateManualAdjustments,
} from './index';
import { mockedPlaidTransaction } from '../types/mocks';

const mockDebug = jest.mocked(Debug);
const mockSheetApi = jest.mocked(sheetApi);
const mockPlaid = jest.mocked(PLAID, { shallow: false });

beforeEach(() => {
  jest.clearAllMocks();
  mockDebug.log.mockResolvedValue(undefined);
  mockDebug.error.mockResolvedValue(undefined);
});

describe('savings', () => {
  describe('getCategory', () => {
    it('returns uppercase string category', () => {
      const tx = mockedPlaidTransaction({ category: 'Transfer' as unknown as string | string[] }).generate();
      expect(getCategory(tx)).toBe('TRANSFER');
    });

    it('returns personal finance category primary', () => {
      const tx = mockedPlaidTransaction({
        personal_finance_category: { primary: 'TRANSFER_OUT' },
      }).generate();
      expect(getCategory(tx)).toBe('TRANSFER_OUT');
    });

    it('returns empty string when no category', () => {
      const tx = mockedPlaidTransaction({ category: undefined as unknown as string | string[] }).generate();
      expect(getCategory(tx)).toBe('');
    });
  });

  describe('isExcluded', () => {
    it('excludes venmo transactions', () => {
      expect(isExcluded('Venmo payment to friend')).toBe(true);
    });

    it('excludes zelle transactions', () => {
      expect(isExcluded('Zelle transfer')).toBe(true);
    });

    it('excludes ATM withdrawals', () => {
      expect(isExcluded('ATM withdrawal')).toBe(true);
    });

    it('does not exclude normal transactions', () => {
      expect(isExcluded('Transfer to savings')).toBe(false);
      expect(isExcluded('Grocery store purchase')).toBe(false);
    });
  });

  describe('buildMonthMap', () => {
    it('creates one month entry', () => {
      const existing = {};
      const map = buildMonthMap('2026-03-01', '2026-03-15', existing);
      const keys = Object.keys(map);
      expect(keys).toEqual(['2026-03']);
      expect(map['2026-03'].transfers).toBe(0);
      expect(map['2026-03'].details).toEqual([]);
    });

    it('creates multiple month entries', () => {
      const map = buildMonthMap('2026-01-01', '2026-03-31', {});
      expect(Object.keys(map)).toEqual(['2026-01', '2026-02', '2026-03']);
    });

    it('carries over manual values from existing', () => {
      const existing = {
        '2026-03': { manual_transfers: 500, manual_retirement: 0, manual_ally: 200 },
      };
      const map = buildMonthMap('2026-03-01', '2026-03-15', existing);
      expect(map['2026-03'].manual_transfers).toBe(500);
      expect(map['2026-03'].manual_ally).toBe(200);
    });
  });

  describe('readExisting', () => {
    it('parses manual values from sheet data', async () => {
      mockSheetApi.getValues.mockResolvedValue([
        ['month', 'net_savings', 'transfers_auto', 'retirement_auto', 'ally_auto', 'manual_transfers', 'manual_retirement', 'manual_ally_out', 'details'],
        ['2026-03', 1000, 200, 100, 50, 500, 0, 200, 'test'],
        ['2026-04', 1500, 300, 150, 75, 0, 100, 0, 'test2'],
      ]);

      const result = await readExisting();
      expect(result['2026-03']).toEqual({ manual_transfers: 500, manual_retirement: 0, manual_ally: 200 });
      expect(result['2026-04']).toEqual({ manual_transfers: 0, manual_retirement: 100, manual_ally: 0 });
    });

    it('returns empty object when tab does not exist', async () => {
      mockSheetApi.getValues.mockRejectedValue(new Error('not found'));
      const result = await readExisting();
      expect(result).toEqual({});
    });
  });

  describe('writeSheet', () => {
    it('writes month data to sheet', async () => {
      const byMonth: Record<string, any> = {
        '2026-03': {
          transfers: 1000, retirement: 500, ally: 200,
          manual_transfers: 0, manual_retirement: 0, manual_ally: 0,
          details: ['2026-03-15: Transfer $100'],
        },
      };

      await writeSheet(byMonth);

      expect(mockSheetApi.clearTab).toHaveBeenCalledWith('savings_tracker', false);
      expect(mockSheetApi.setValues).toHaveBeenCalled();
    });
  });

  describe('populateManualAdjustments', () => {
    it('writes manual values to matching months', async () => {
      mockSheetApi.getValues.mockResolvedValue([
        ['month', 'net_savings', 'transfers_auto', 'retirement_auto', 'ally_auto', 'manual_transfers', 'manual_retirement', 'manual_ally_out', 'details'],
        ['2026-01', 0, 0, 0, 0, 0, 0, 0, ''],
        ['2026-03', 0, 0, 0, 0, 0, 0, 0, ''],
      ]);
      mockSheetApi.setCell.mockResolvedValue(undefined);

      await populateManualAdjustments();

      // 2026-01 should get manual values (8000/0/0)
      expect(mockSheetApi.setCell).toHaveBeenCalledWith('savings_tracker', 'F2', 8000);
      // 2026-03 should get manual values (3000/0/3533)
      expect(mockSheetApi.setCell).toHaveBeenCalledWith('savings_tracker', 'F3', 3000);
      expect(mockSheetApi.setCell).toHaveBeenCalledWith('savings_tracker', 'H3', 3533);
    });

    it('skips when no data', async () => {
      mockSheetApi.getValues.mockResolvedValue([]);
      await populateManualAdjustments();
      expect(mockSheetApi.setCell).not.toHaveBeenCalled();
    });
  });
});

  describe('writeSheet preserves existing months', () => {
    it('preserves months outside the backfill range', async () => {
      // Existing sheet has 2025-08 and 2026-01 data
      mockSheetApi.getValues.mockResolvedValue([
        ['month', 'net_savings', 'transfers_auto', 'retirement_auto', 'ally_auto', 'manual_transfers', 'manual_retirement', 'manual_ally_out', 'details'],
        ['2025-08', '=C2+D2-E2+F2+G2-H2', 8000, 0, 0, 8000, 0, 0, 'old data'],
        ['2026-01', '=C3+D3-E3+F3+G3-H3', 8000, 0, 0, 8000, 0, 0, 'old data'],
      ]);
      mockSheetApi.clearTab.mockResolvedValue(undefined);
      mockSheetApi.setValues.mockResolvedValue(undefined);

      // Backfill only updates 2026-07
      const byMonth: Record<string, any> = {
        '2026-07': {
          transfers: 0, retirement: 955.5, ally: 0,
          manual_transfers: 0, manual_retirement: 0, manual_ally: 0,
          details: ['2026-07-10: 401k contrib $955.5'],
        },
      };

      await writeSheet(byMonth);

      // Should write 3 rows: 2025-08, 2026-01 (preserved) + 2026-07 (updated)
      const writeCall = mockSheetApi.setValues.mock.calls.find(
        (c: any) => c[0] === 'savings_tracker!A2'
      );
      expect(writeCall).toBeDefined();
      const writtenRows = writeCall[1];
      expect(writtenRows).toHaveLength(3);
      expect(writtenRows[0][0]).toBe('2025-08');
      expect(writtenRows[1][0]).toBe('2026-01');
      expect(writtenRows[2][0]).toBe('2026-07');
    });
  });

describe('backfill calls populateManualAdjustments', () => {
  it('populates manual adjustments after writing sheet', async () => {
    const { backfill } = require('./index');
    // Mock sheet-api: getValues returns existing savings data, setCell records calls
    mockSheetApi.getValues.mockResolvedValue([
      ['month', 'net_savings', 'transfers_auto', 'retirement_auto', 'ally_auto', 'manual_transfers', 'manual_retirement', 'manual_ally_out', 'details'],
      ['2026-01', '=C2+D2-E2+F2+G2-H2', 0, 0, 0, 0, 0, 0, ''],
    ]);
    mockSheetApi.ensureTab.mockResolvedValue('savings_tracker');
    mockSheetApi.clearTab.mockResolvedValue(undefined);
    mockSheetApi.setValues.mockResolvedValue(undefined);
    mockSheetApi.setCell.mockResolvedValue(undefined);
    // Mock PLAID: return null tokens so fetchAllTransactions/fetchAllInvestmentTransactions skip
    mockPlaid.getAccessToken.mockReturnValue(null);
    mockPlaid.getAccounts.mockResolvedValue([]);
    mockPlaid.transactionsGet.mockResolvedValue([]);
    mockPlaid.investmentTransactionsGet.mockResolvedValue([]);

    await backfill('2026-01-01', '2026-01-31');

    // populateManualAdjustments should have been called, writing manual values for 2026-01
    // 2026-01 manual values: transfers=8000, retirement=0, ally=0
    expect(mockSheetApi.setCell).toHaveBeenCalledWith('savings_tracker', 'F2', 8000);
  });
});

describe('normalizeMonth', () => {
  const { normalizeMonth } = require('./index');

  it('passes through YYYY-MM unchanged', () => {
    expect(normalizeMonth('2026-05')).toBe('2026-05');
  });

  it('zero-pads single-digit month (2026-5 -> 2026-05)', () => {
    expect(normalizeMonth('2026-5')).toBe('2026-05');
    expect(normalizeMonth('2026-1')).toBe('2026-01');
    expect(normalizeMonth('2026-12')).toBe('2026-12');
  });

  it('converts Date objects from GAS', () => {
    expect(normalizeMonth(new Date('2026-07-01T00:00:00'))).toBe('2026-07');
    expect(normalizeMonth(new Date('2025-08-15T00:00:00'))).toBe('2025-08');
  });

  it('converts M/D/YYYY GAS date strings', () => {
    expect(normalizeMonth('7/1/2026')).toBe('2026-07');
    expect(normalizeMonth('12/15/2025')).toBe('2025-12');
  });

  it('handles YYYY-MM-DD by taking first 7 chars', () => {
    expect(normalizeMonth('2026-07-15')).toBe('2026-07');
  });

  it('returns empty for falsy input', () => {
    expect(normalizeMonth('')).toBe('');
    expect(normalizeMonth(null)).toBe('');
    expect(normalizeMonth(undefined)).toBe('');
  });
});

describe('writeSheet dedup + normalize', () => {
  it('merges duplicate months with different formats (2026-5 and 2026-05)', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['month', 'net_savings', 'transfers_auto', 'retirement_auto', 'ally_auto', 'manual_transfers', 'manual_retirement', 'manual_ally_out', 'details'],
      ['2026-5', '=C2+D2-E2+F2+G2-H2', 100, 200, 0, 0, 0, 0, 'old dup'],
      ['2026-05', '=C3+D3-E3+F3+G3-H3', 100, 200, 0, 0, 0, 0, 'old dup 2'],
      ['7/1/2026', '=C4+D4-E4+F4+G4-H4', 0, 500, 0, 0, 0, 0, 'date obj row'],
    ]);
    mockSheetApi.clearTab.mockResolvedValue(undefined);
    mockSheetApi.setValues.mockResolvedValue(undefined);

    const byMonth: Record<string, any> = {
      '2026-07': { transfers: 0, retirement: 955, ally: 0, manual_transfers: 0, manual_retirement: 0, manual_ally: 0, details: ['new'] },
    };

    await writeSheet(byMonth);

    const writeCall = mockSheetApi.setValues.mock.calls.find((c: any) => c[0] === 'savings_tracker!A2');
    expect(writeCall).toBeDefined();
    const writtenRows = writeCall[1];
    // 2026-5 and 2026-05 merge into one 2026-05.
    // 7/1/2026 normalizes to 2026-07, then gets overridden by new 2026-07 data.
    // Result: 2 unique months, no dupes.
    expect(writtenRows).toHaveLength(2);
    const months = writtenRows.map((r: any) => r[0]);
    expect(months).toEqual(['2026-05', '2026-07']);
    expect(months.filter((m: string) => m === '2026-05')).toHaveLength(1);
    expect(months.filter((m: string) => m === '2026-07')).toHaveLength(1);
  });
});

describe('populateManualAdjustments with normalized months', () => {
  it('matches manual values even when sheet has un-padded month (2026-1)', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['month', 'net_savings', 'transfers_auto', 'retirement_auto', 'ally_auto', 'manual_transfers', 'manual_retirement', 'manual_ally_out', 'details'],
      ['2026-1', 0, 0, 0, 0, 0, 0, 0, ''],  // un-padded in sheet
    ]);
    mockSheetApi.setCell.mockResolvedValue(undefined);

    await populateManualAdjustments();

    // manual['2026-01'] should match normalized '2026-1'
    expect(mockSheetApi.setCell).toHaveBeenCalledWith('savings_tracker', 'F2', 8000);
  });

  it('matches manual values even when sheet has Date object month', async () => {
    mockSheetApi.getValues.mockResolvedValue([
      ['month', 'net_savings', 'transfers_auto', 'retirement_auto', 'ally_auto', 'manual_transfers', 'manual_retirement', 'manual_ally_out', 'details'],
      [new Date(2026, 2, 1), 0, 0, 0, 0, 0, 0, 0, ''],  // Date object (March, local time) in sheet
    ]);
    mockSheetApi.setCell.mockResolvedValue(undefined);

    await populateManualAdjustments();

    // manual['2026-03'] should match Date object normalized to 2026-03
    expect(mockSheetApi.setCell).toHaveBeenCalledWith('savings_tracker', 'F2', 3000);
    expect(mockSheetApi.setCell).toHaveBeenCalledWith('savings_tracker', 'H2', 3533);
  });
});

describe('backfill regression: qualifying transactions (2026-07-26 outage)', () => {
  // Root cause of the 07-26 → 07-28 sync outage: the `date` loop variable was
  // renamed to `dateStr` but two details.push() calls still referenced `date`,
  // throwing `ReferenceError: date is not defined` at runtime in GAS.
  // ts-jest (diagnostics: false) and esbuild both miss it — only a test that
  // actually executes these lines catches it.
  it('processes transfer and ally transactions without ReferenceError', async () => {
    const { backfill } = require('./index');
    mockSheetApi.getValues.mockResolvedValue([
      ['month', 'net_savings', 'transfers_auto', 'retirement_auto', 'ally_auto', 'manual_transfers', 'manual_retirement', 'manual_ally_out', 'details'],
      ['2026-01', '=C2+D2-E2+F2+G2-H2', 0, 0, 0, 0, 0, 0, ''],
    ]);
    mockSheetApi.ensureTab.mockResolvedValue('savings_tracker');
    mockSheetApi.clearTab.mockResolvedValue(undefined);
    mockSheetApi.setValues.mockResolvedValue(undefined);
    mockSheetApi.setCell.mockResolvedValue(undefined);

    // Qualifying transfer: TRANSFER category + checking + positive + not excluded
    const transferTx = mockedPlaidTransaction({
      date: '2026-01-15',
      amount: 500,
      name: 'Online transfer to savings',
      merchant_name: '',
      category: 'Transfer',
      _account_name: 'Adv Plus Banking',
      _account_subtype: 'checking',
    }).generate();
    // Qualifying ally outflow: account name includes 'ally', positive amount
    const allyTx = mockedPlaidTransaction({
      date: '2026-01-20',
      amount: 200,
      name: 'Ally payment',
      merchant_name: '',
      category: 'Other',
      _account_name: 'Ally Savings Account',
      _account_subtype: 'savings',
    }).generate();

    // Only 'bofa' has a token, so each transaction is fetched exactly once
    // (BANK_ITEMS = ally/bofa/fidelity would otherwise each return the mocks).
    mockPlaid.getAccessToken.mockImplementation((item: string) => (item === 'bofa' ? 'test-token' : null));
    mockPlaid.getAccounts.mockResolvedValue([]);
    mockPlaid.transactionsGet.mockResolvedValue([transferTx, allyTx]);
    mockPlaid.investmentTransactionsGet.mockResolvedValue([]);

    await backfill('2026-01-01', '2026-01-31');

    const writeCall = mockSheetApi.setValues.mock.calls.find((c: any) => c[0] === 'savings_tracker!A2');
    expect(writeCall).toBeDefined();
    const janRow = writeCall[1].find((r: any) => r[0] === '2026-01');
    expect(janRow).toBeDefined();
    expect(janRow[2]).toBe(500); // transfers_auto
    expect(janRow[4]).toBe(200); // ally_auto
    expect(janRow[8]).toContain('2026-01-15: Transfer to savings $500');
    expect(janRow[8]).toContain('2026-01-20: Ally outflow $200');
  });
});

