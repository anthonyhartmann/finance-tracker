/**
 * config.test.ts — Tests for the local config store (get/set/delete/getKeys).
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = jest.mocked(fs);

import { getProperty, setProperty, deleteProperty, getKeys } from './index';

const CONFIG_PATH = path.join(__dirname, '..', '..', 'local-config.json');

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.existsSync.mockReturnValue(false);
  mockFs.readFileSync.mockReturnValue('{}');
  mockFs.writeFileSync.mockImplementation(() => {});
});

describe('config', () => {
  describe('getProperty', () => {
    it('returns env var if set (takes priority over file)', () => {
      process.env.TEST_KEY_123 = 'from-env';
      try {
        expect(getProperty('TEST_KEY_123')).toBe('from-env');
      } finally {
        delete process.env.TEST_KEY_123;
      }
    });

    it('returns null when key not in env or file', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(getProperty('NONEXISTENT_KEY')).toBeNull();
    });

    it('reads from config file when key not in env', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ MY_KEY: 'file-value' }));
      expect(getProperty('MY_KEY')).toBe('file-value');
      expect(mockFs.readFileSync).toHaveBeenCalledWith(CONFIG_PATH, 'utf8');
    });

    it('returns null for missing key in config file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ OTHER_KEY: 'val' }));
      expect(getProperty('MISSING_KEY')).toBeNull();
    });

    it('handles corrupt JSON gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('not valid json{{{');
      expect(getProperty('ANY_KEY')).toBeNull();
    });
  });

  describe('setProperty', () => {
    it('writes key-value to config file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ existing: 'old' }));
      setProperty('NEW_KEY', 'new_value');
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_PATH,
        expect.stringContaining('"NEW_KEY": "new_value"')
      );
    });

    it('preserves existing keys when adding new one', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ a: '1', b: '2' }));
      setProperty('c', '3');
      const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(written.a).toBe('1');
      expect(written.b).toBe('2');
      expect(written.c).toBe('3');
    });

    it('overwrites existing key', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ KEY: 'old' }));
      setProperty('KEY', 'new');
      const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(written.KEY).toBe('new');
    });

    it('creates config file from scratch if none exists', () => {
      mockFs.existsSync.mockReturnValue(false);
      setProperty('FRESH', 'value');
      const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(written.FRESH).toBe('value');
    });
  });

  describe('deleteProperty', () => {
    it('removes key from config file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ a: '1', b: '2' }));
      deleteProperty('a');
      const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(written.a).toBeUndefined();
      expect(written.b).toBe('2');
    });

    it('does not throw when deleting nonexistent key', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ a: '1' }));
      expect(() => deleteProperty('NOPE')).not.toThrow();
    });

    it('does not throw when config file missing', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(() => deleteProperty('ANYTHING')).not.toThrow();
    });
  });

  describe('getKeys', () => {
    it('returns all keys from config file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ x: '1', y: '2', z: '3' }));
      const keys = getKeys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('x');
      expect(keys).toContain('y');
      expect(keys).toContain('z');
    });

    it('returns empty array for empty config file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');
      expect(getKeys()).toEqual([]);
    });

    it('returns empty array when config file missing', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(getKeys()).toEqual([]);
    });

    it('handles corrupt JSON gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('bad json!!');
      expect(getKeys()).toEqual([]);
    });
  });
});
