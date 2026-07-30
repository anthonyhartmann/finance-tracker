import type { IConfigAdapter } from './types';

export const gasConfig: IConfigAdapter = {
  getProperty(key: string): string | null {
    return PropertiesService.getScriptProperties().getProperty(key);
  },
  setProperty(key: string, value: string): void {
    PropertiesService.getScriptProperties().setProperty(key, value);
  },
  deleteProperty(key: string): void {
    PropertiesService.getScriptProperties().deleteProperty(key);
  },
  getKeys(): string[] {
    return PropertiesService.getScriptProperties().getKeys();
  },
};
