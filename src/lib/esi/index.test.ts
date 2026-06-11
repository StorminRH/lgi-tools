import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  __resetBudgetForTests,
  ESI_BUDGET_FLOOR,
  EsiBudgetExhaustedError,
  EsiServerError,
  esiFetch,
  getBudgetRemaining,
} from './index';

function mockResponse(
  status: number,
  remainHeader: string | null,
  body: unknown = {},
): Response {
  const headers = new Headers();
  if (remainHeader !== null) {
    headers.set('X-ESI-Error-Limit-Remain', remainHeader);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

describe('esiFetch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetBudgetForTests();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('dispatches the request and updates the remaining count from the response header', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, '95'));

    const res = await esiFetch('https://esi.evetech.net/latest/test');

    expect(res.status).toBe(200);
    expect(getBudgetRemaining()).toBe(95);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('sends the outbound User-Agent on every ESI call', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, '95'));

    await esiFetch('https://esi.evetech.net/test');

    const [, init] = fetchSpy.mock.calls[0];
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
  });

  it('sends the X-Compatibility-Date header to pin the ESI contract', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, '95'));

    await esiFetch('https://esi.evetech.net/test');

    const [, init] = fetchSpy.mock.calls[0];
    expect(new Headers(init?.headers).get('X-Compatibility-Date')).toBe(
      ESI_COMPATIBILITY_DATE,
    );
  });

  it('refuses to dispatch when the remaining count is below ESI_BUDGET_FLOOR', async () => {
    // Prime the budget below the floor via a previous response.
    fetchSpy.mockResolvedValueOnce(mockResponse(200, String(ESI_BUDGET_FLOOR - 1)));
    await esiFetch('https://esi.evetech.net/latest/test');
    expect(getBudgetRemaining()).toBe(ESI_BUDGET_FLOOR - 1);

    // Next call refuses to dispatch.
    await expect(esiFetch('https://esi.evetech.net/latest/test')).rejects.toBeInstanceOf(
      EsiBudgetExhaustedError,
    );
    // Refusal happened before fetch — still only one call recorded.
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('throws EsiServerError on 5xx and still reads the header', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(503, '88'));

    const err = await esiFetch('https://esi.evetech.net/latest/test').catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(EsiServerError);
    expect(err.status).toBe(503);
    expect(getBudgetRemaining()).toBe(88);
  });

  it('throws EsiBudgetExhaustedError on 420 regardless of header value', async () => {
    // ESI sends 420 when you trip the limit; the header on this response
    // may be stale, so the wrapper treats 420 as exhausted unconditionally.
    fetchSpy.mockResolvedValueOnce(mockResponse(420, '50'));

    await expect(esiFetch('https://esi.evetech.net/latest/test')).rejects.toBeInstanceOf(
      EsiBudgetExhaustedError,
    );
  });

  it('does not update the remaining count when the header is missing', async () => {
    // Some intermediate proxies strip non-standard headers; defensive.
    fetchSpy.mockResolvedValueOnce(mockResponse(200, null));

    await esiFetch('https://esi.evetech.net/latest/test');
    expect(getBudgetRemaining()).toBe(Number.POSITIVE_INFINITY);
  });

  it('ignores non-numeric header values', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, 'not-a-number'));

    await esiFetch('https://esi.evetech.net/latest/test');
    expect(getBudgetRemaining()).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns 4xx responses to the caller without throwing', async () => {
    // 4xx is the caller's problem (bad type ID, etc.), not the wrapper's.
    fetchSpy.mockResolvedValueOnce(mockResponse(404, '99'));

    const res = await esiFetch('https://esi.evetech.net/latest/test');
    expect(res.status).toBe(404);
    expect(getBudgetRemaining()).toBe(99);
  });
});
