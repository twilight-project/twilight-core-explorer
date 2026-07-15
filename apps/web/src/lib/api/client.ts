// Thin, typed GET-only fetch wrapper over the Phase 9 API. The response types are derived
// straight from the generated OpenAPI schema (single source of truth), so a contract change
// becomes a type error here. No mutations are exposed; the API is the only data layer.
import { API_BASE_URL } from '../env';
import type { paths } from './generated/schema';

/** The error envelope shape the API returns on non-2xx responses. */
export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

/** Known `error.code` values from apps/api/src/lib/errors.ts, plus one synthetic transport code. */
export const ERROR_CODES = {
  invalidCursor: 'invalid_cursor',
  invalidEpoch: 'invalid_epoch',
  invalidHeight: 'invalid_height',
  invalidQuery: 'invalid_query',
  invalidSlotId: 'invalid_slot_id',
  notFound: 'not_found',
  notReady: 'not_ready',
  /** Synthetic: the API host could not be reached at all (network/CORS/DNS). */
  networkUnavailable: 'network_unavailable',
  /** Synthetic: non-2xx without a recognizable error envelope. */
  httpError: 'http_error',
  /** Synthetic: a required path parameter was missing before the request was issued. */
  missingPathParam: 'missing_path_param',
  /** Synthetic: the API accepted the connection but did not answer within REQUEST_TIMEOUT_MS. */
  timeout: 'timeout',
} as const;

/** A hung API must surface as an error, not an indefinite skeleton. */
export const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** True when the failure is the API being unreachable (vs. a structured API error). */
export function isApiUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.code === ERROR_CODES.networkUnavailable;
}

/**
 * True for transient transport failures worth retrying (unreachable/hung/proxy errors).
 * Structured API answers (not_found, invalid_*, not_ready) are definitive — retrying them
 * only doubles the latency of the common "not indexed yet" case.
 */
export function isRetryable(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === ERROR_CODES.networkUnavailable ||
      err.code === ERROR_CODES.httpError ||
      err.code === ERROR_CODES.timeout)
  );
}

/** True when the API returned a structured not-found. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.code === ERROR_CODES.notFound;
}

type GetOp<P extends keyof paths> = paths[P] extends { get: infer G } ? G : never;

/** The 200 application/json body type for a GET path, straight from the generated schema. */
export type JsonOf<P extends keyof paths> =
  GetOp<P> extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R : never;

function isErrorBody(x: unknown): x is ApiErrorBody {
  if (typeof x !== 'object' || x === null || !('error' in x)) return false;
  const e = (x as { error: unknown }).error;
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(API_BASE_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      // Heights/ids/amounts/cursors are already strings; numbers here are only small params (e.g. limit).
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// Shared GET core: fetch a concrete (already-substituted) path + parse the envelope. Throws ApiError
// (carrying error.code) on transport failure or a non-2xx error envelope.
async function request(
  concretePath: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<unknown> {
  // Distinguish "our timer fired" from a caller/browser abort or a plain network failure.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(buildUrl(concretePath, query), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new ApiError(
        ERROR_CODES.timeout,
        `The Twilight API did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`,
        0,
      );
    }
    throw new ApiError(
      ERROR_CODES.networkUnavailable,
      'The Twilight API is unreachable.',
      0,
      cause instanceof Error ? cause.message : String(cause),
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }

  if (!res.ok) {
    if (isErrorBody(body)) {
      throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
    }
    throw new ApiError(ERROR_CODES.httpError, `Request failed (HTTP ${res.status}).`, res.status);
  }

  return body;
}

// Substitute {name} tokens in a templated path from `params`, URL-encoding each value. Rejects a
// missing/empty required param BEFORE any fetch, so a literal `/blocks/{height}` can never be called.
function substitutePath(template: string, params: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === '') {
      throw new ApiError(
        ERROR_CODES.missingPathParam,
        `Missing required path parameter: ${name}`,
        0,
      );
    }
    return encodeURIComponent(value);
  });
}

/**
 * GET a collection/query endpoint. Returns the full typed envelope (`{ data }` or `{ data, page }`).
 * Callers branch on `error.code`, never on message text. (Behavior unchanged from Phase 10a.)
 */
export async function apiGet<P extends keyof paths>(
  path: P,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<JsonOf<P>> {
  return (await request(path as string, query)) as JsonOf<P>;
}

/**
 * GET a templated endpoint (e.g. `/api/v1/blocks/{height}`). `params` fills the `{...}` tokens
 * (URL-encoded); a missing required param rejects before fetch. Response typing is preserved from
 * the generated schema via `JsonOf<P>` on the templated path key.
 */
export async function apiGetPath<P extends keyof paths>(
  path: P,
  params: Record<string, string>,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<JsonOf<P>> {
  const concrete = substitutePath(path as string, params);
  return (await request(concrete, query)) as JsonOf<P>;
}
