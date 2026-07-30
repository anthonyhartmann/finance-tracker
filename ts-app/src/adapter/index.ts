import type { ISheetAdapter, IConfigAdapter, ICalendarAdapter, IHttpAdapter } from './types';
import { gasSheet } from './gas-sheet';
import { nodeSheet } from './node-sheet';
import { gasConfig } from './gas-config';
import { nodeConfig } from './node-config';
import { gasCalendar } from './gas-calendar';
import { nodeCalendar } from './node-calendar';
import { gasHttp } from './gas-http';
import { nodeHttp } from './node-http';

// esbuild replaces process.env.RUNTIME with the literal string at build time.
// With --define:process.env.RUNTIME="gas", the node branch is dead-code-eliminated.
const isGas = process.env.RUNTIME === 'gas';

export const sheet: ISheetAdapter = isGas ? gasSheet : nodeSheet;
export const config: IConfigAdapter = isGas ? gasConfig : nodeConfig;
export const calendar: ICalendarAdapter = isGas ? gasCalendar : nodeCalendar;
export const http: IHttpAdapter = isGas ? gasHttp : nodeHttp;
