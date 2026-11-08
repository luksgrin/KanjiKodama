import { parseUri, type ParsedUri } from './uriParser';

/** WaniKani's API base URL. */
export const WANIKANI_API_BASE_URL = 'https://api.wanikani.com';

/** The messages `normalizeServerUrl` throws with (as `IllegalArgumentException`). */
export const NOT_A_SERVER_ADDRESS = 'This is not a valid server address.';
export const NOT_HTTP = 'The server address must start with https:// or http://.';

/** A typed server address that `normalize` rejects; `message` is shown to the learner. */
export class ServerAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerAddressError';
  }
}

/** `String.trim`: strips chars <= U+0020 only. */
function trimControlChars(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) {
    start++;
  }
  while (end > start && s.charCodeAt(end - 1) <= 0x20) {
    end--;
  }
  return s.substring(start, end);
}

/** `String.equalsIgnoreCase`. */
function equalsIgnoreCase(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x !== y && x.toUpperCase() !== y.toUpperCase() && x.toLowerCase() !== y.toLowerCase()) {
      return false;
    }
  }
  return true;
}

function tryParse(s: string): ParsedUri | null {
  try {
    return parseUri(s);
  } catch {
    return null;
  }
}

/**
 * Cleans up a typed URL. Adds https:// when no scheme was given, drops
 * trailing slashes and then one `/v2` (case-insensitive). Keeps the case, a query, a fragment and a
 * port as typed.
 *
 * @throws ServerAddressError when it is not a usable http(s) URL
 */
export function normalizeServerUrl(raw: string): string {
  let s = trimControlChars(raw);
  if (!s.includes('://')) {
    s = 'https://' + s;
  }
  while (s.endsWith('/')) {
    s = s.substring(0, s.length - 1);
  }
  if (s.toLowerCase().endsWith('/v2')) {
    s = s.substring(0, s.length - 3);
  }
  const uri = tryParse(s);
  if (uri === null) {
    throw new ServerAddressError(NOT_A_SERVER_ADDRESS);
  }
  const scheme = uri.scheme;
  const http = scheme !== null && (equalsIgnoreCase(scheme, 'https') || equalsIgnoreCase(scheme, 'http'));
  if (!http || uri.host === null) {
    throw new ServerAddressError(NOT_HTTP);
  }
  return s;
}

/** WaniKani's own API (exact, case-insensitive). */
export function isWaniKaniUrl(baseUrl: string): boolean {
  return equalsIgnoreCase(WANIKANI_API_BASE_URL, baseUrl);
}

/** "WaniKani", else the URL's host, else the URL itself. */
export function serverLabel(baseUrl: string): string {
  if (isWaniKaniUrl(baseUrl)) {
    return 'WaniKani';
  }
  return tryParse(baseUrl)?.host ?? baseUrl;
}
