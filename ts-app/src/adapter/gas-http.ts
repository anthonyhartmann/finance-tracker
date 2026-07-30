/** GAS HTTP adapter — wraps UrlFetchApp. */
import type { IHttpAdapter } from './types';

export const gasHttp: IHttpAdapter = {
  postJson(url: string, body: Record<string, unknown>): Promise<{ status: number; data: any }> {
    let response: any;
    try {
      response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(body),
        muteHttpExceptions: true,
      });
    } catch (e: any) {
      // GAS throws on network errors / timeouts (60s ceiling). Surface a
      // structured error so callers can catch and log instead of stalling
      // the entire sync chain silently.
      throw new Error('UrlFetchApp.fetch failed for ' + url + ': ' + (e instanceof Error ? e.message : String(e)));
    }
    const code = response.getResponseCode();
    const text = response.getContentText();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return Promise.resolve({ status: code, data });
  },
};
