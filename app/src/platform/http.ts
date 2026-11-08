/**
 * Server-mode HTTP on the web build: `fetch`. The server must allow CORS (WaniKani does; OpenKani
 * uses Hono's `cors()` defaults, unverified on the deployed instance) and, from an https:// page,
 * be https:// itself (mixed content). User-Agent can't be set from a page and conditional headers
 * would cost a preflight, so they are dropped here; the browser's HTTP cache revalidates with ETag
 * on its own.
 */
import { HttpNetworkError, type HttpApi, type HttpRequest, type HttpResponse } from './index';

const DROPPED = new Set(['user-agent', 'if-none-match', 'if-modified-since']);
const DEFAULT_TIMEOUT_MS = 60_000;

/** `fetch`-based `HttpApi`; `fetchImpl` is injectable for tests. */
export function createFetchHttp(fetchImpl: typeof fetch = (...a) => globalThis.fetch(...a)): HttpApi {
  return {
    kind: 'fetch',
    async request(req: HttpRequest): Promise<HttpResponse> {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers ?? {})) if (!DROPPED.has(k.toLowerCase())) headers[k] = v;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        const res = await fetchImpl(req.url, {
          method: req.method,
          headers,
          body: req.body,
          signal: ctrl.signal,
          credentials: 'omit',
          redirect: 'follow',
        });
        const out: Record<string, string> = {};
        res.headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
        return { status: res.status, headers: out, body: await res.text() };
      } catch (e) {
        throw new HttpNetworkError(e instanceof Error ? e.message : String(e));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const fetchHttp: HttpApi = createFetchHttp();
