/**
 * Server-mode HTTP on the Android build: `CapacitorHttp` (native `HttpURLConnection`, no CORS,
 * `http://` LAN servers allowed when cleartext is permitted). Sets User-Agent like the Java app.
 *
 * CapacitorHttp hands back JSON bodies already parsed (whenever the response's Content-Type is JSON,
 * whatever `responseType` says); they are turned back into text so callers parse one way.
 */
import { CapacitorHttp, type HttpOptions } from '@capacitor/core';

import { HttpNetworkError, type HttpApi, type HttpRequest, type HttpResponse } from './index';

type Requester = (options: HttpOptions) => Promise<{ status: number; headers: Record<string, string>; data: unknown }>;

const CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 60_000;

function bodyText(data: unknown): string {
  if (data === undefined || data === null) return '';
  return typeof data === 'string' ? data : JSON.stringify(data);
}

/** `CapacitorHttp`-based `HttpApi`; `requester` is injectable for tests. */
export function createAndroidHttp(requester: Requester = (o) => CapacitorHttp.request(o)): HttpApi {
  return {
    kind: 'native',
    async request(req: HttpRequest): Promise<HttpResponse> {
      let res: Awaited<ReturnType<Requester>>;
      try {
        res = await requester({
          url: req.url,
          method: req.method,
          headers: req.headers ?? {},
          // JSON text: the native side writes a string `data` as is for application/json.
          data: req.body,
          responseType: 'text',
          connectTimeout: CONNECT_TIMEOUT_MS,
          readTimeout: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
      } catch (e) {
        throw new HttpNetworkError(e instanceof Error ? e.message : String(e));
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers ?? {})) headers[k.toLowerCase()] = String(v);
      return { status: res.status, headers, body: bodyText(res.data) };
    },
  };
}

export const androidHttp: HttpApi = createAndroidHttp();
