/**
 * GAS-only adapter — imported by gas-entry.ts to replace the regular adapter.
 * No ternary, no node code. All consumers (sheet-api, config, calendar)
 * route through the adapter, and this file is swapped in at build time.
 */
export { gasSheet as sheet } from './gas-sheet';
export { gasConfig as config } from './gas-config';
export { gasCalendar as calendar } from './gas-calendar';
export { gasHttp as http } from './gas-http';
