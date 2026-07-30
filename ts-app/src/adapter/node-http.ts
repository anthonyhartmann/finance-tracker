/** Node.js HTTP adapter — wraps native fetch. */
import type { IHttpAdapter } from './types';

export const nodeHttp: IHttpAdapter = {
  async postJson(url: string, body: Record<string, unknown>): Promise<{ status: number; data: any }> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { status: response.status, data };
  },
};
