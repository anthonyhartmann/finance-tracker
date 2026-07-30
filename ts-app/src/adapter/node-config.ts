import * as fs from 'fs';
import * as path from 'path';
import type { IConfigAdapter } from './types';

const CONFIG_PATH = path.join(__dirname, '..', '..', 'local-config.json');

function load(): Record<string, string> {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function save(data: Record<string, string>): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

export const nodeConfig: IConfigAdapter = {
  getProperty(key: string): string | null {
    if (process.env[key] !== undefined) return process.env[key]!;
    const cfg = load();
    return cfg[key] || null;
  },
  setProperty(key: string, value: string): void {
    const cfg = load(); cfg[key] = value; save(cfg);
  },
  deleteProperty(key: string): void {
    const cfg = load(); delete cfg[key]; save(cfg);
  },
  getKeys(): string[] {
    return Object.keys(load());
  },
};
