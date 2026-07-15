import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  ERROR_CODES,
  REQUEST_TIMEOUT_MS,
  apiGet,
  apiGetPath,
  isRetryable,
} from './client';

function spyFetch(body: unknown = { data: {} }) {
  const spy = vi.fn(async (_url?: string, _init?: unknown) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}
function lastUrl(spy: ReturnType<typeof spyFetch>): string {
  return String(spy.mock.calls[0]?.[0]);
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('apiGet envelope + error handling', () => {
  it('returns a { data } envelope', async () => {
    mockFetch(200, { data: { chainId: 'twilight-1' } });
    const res = await apiGet('/api/v1/status');
    expect(res.data.chainId).toBe('twilight-1');
  });

  it('returns a { data, page } envelope', async () => {
    mockFetch(200, { data: [{ height: '5' }], page: { limit: 1, nextCursor: 'opaque-cursor' } });
    const res = await apiGet('/api/v1/blocks', { limit: 1 });
    expect(res.data).toHaveLength(1);
    expect(res.page.nextCursor).toBe('opaque-cursor');
  });

  it('throws ApiError carrying error.code on a structured { error }', async () => {
    mockFetch(404, { error: { code: 'not_found', message: 'no such block' } });
    await expect(apiGet('/api/v1/status')).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('throws network_unavailable when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const err = await apiGet('/api/v1/status').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('network_unavailable');
  });
});

describe('apiGetPath templated paths', () => {
  it('substitutes and URL-encodes path params (never calls a literal {token})', async () => {
    const spy = spyFetch();
    await apiGetPath('/api/v1/accounts/{address}', { address: 'twilight 1/x' });
    const url = lastUrl(spy);
    expect(url).toContain('/api/v1/accounts/twilight%201%2Fx');
    expect(url).not.toContain('{address}');
  });

  it('forwards query params alongside the substituted path', async () => {
    const spy = spyFetch();
    await apiGetPath('/api/v1/blocks/{height}', { height: '3196' }, { include: 'raw' });
    const url = lastUrl(spy);
    expect(url).toContain('/api/v1/blocks/3196');
    expect(url).toContain('include=raw');
  });

  it('rejects with missing_path_param and issues NO fetch when a required param is absent', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await expect(apiGetPath('/api/v1/blocks/{height}', {})).rejects.toMatchObject({
      code: 'missing_path_param',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('request timeout', () => {
  afterEach(() => vi.useRealTimers());

  it('rejects with a timeout ApiError when the API never responds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url?: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const pending = apiGet('/api/v1/status').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    const err = await pending;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(ERROR_CODES.timeout);
  });
});

describe('isRetryable', () => {
  const mk = (code: string) => new ApiError(code, 'msg', 0);

  it('is true only for transient transport codes', () => {
    expect(isRetryable(mk(ERROR_CODES.networkUnavailable))).toBe(true);
    expect(isRetryable(mk(ERROR_CODES.httpError))).toBe(true);
    expect(isRetryable(mk(ERROR_CODES.timeout))).toBe(true);
  });

  it('is false for definitive API answers and unknown errors', () => {
    expect(isRetryable(mk(ERROR_CODES.notFound))).toBe(false);
    expect(isRetryable(mk(ERROR_CODES.invalidHeight))).toBe(false);
    expect(isRetryable(mk(ERROR_CODES.notReady))).toBe(false);
    expect(isRetryable(new Error('boom'))).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});
