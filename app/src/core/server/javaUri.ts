/**
 * The parts of `java.net.URI`'s parser (JDK 21, RFC 2396 with Java's deviations) that
 * `local/ServerMode` depends on: whether `new URI(s)` throws, and what `getScheme()` and `getHost()`
 * return. Only the character classes and the authority/host rules are ported; the parsed parts other
 * than scheme and host are not kept.
 *
 * Java keeps a server authority's host only when it parses as an IPv4 address, a bracketed IPv6
 * address or an RFC 2396 hostname; otherwise the authority falls back to a registry-based name and
 * `getHost()` is null (no exception). This is why `https://under_score.example.org` is "not http(s)"
 * in `ServerMode.normalize` rather than "not valid".
 */

/** Thrown where `new URI(s)` throws `URISyntaxException`. */
export class UriSyntaxError extends Error {
  constructor(message: string, readonly index: number) {
    super(message);
    this.name = 'UriSyntaxError';
  }
}

export interface ParsedUri {
  scheme: string | null;
  host: string | null;
}

// Character classes, as sets of ASCII characters (java.net.URI's L_* / H_* masks).
const DIGIT = '0123456789';
const UPALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWALPHA = 'abcdefghijklmnopqrstuvwxyz';
const ALPHA = UPALPHA + LOWALPHA;
const ALPHANUM = ALPHA + DIGIT;
const HEX = DIGIT + 'ABCDEFabcdef';
const MARK = "-_.!~*'()";
const UNRESERVED = ALPHANUM + MARK;
const RESERVED = ';/?:@&=+$,[]';
const PCHAR = UNRESERVED + ':@&=+$,';
const PATH = PCHAR + ';/';
const URIC = RESERVED + UNRESERVED;
const USERINFO = UNRESERVED + ';:&=+$,';
const REG_NAME = UNRESERVED + '$,;:@&=+';
const SERVER = USERINFO + ALPHANUM + '-.:@[]';
const SERVER_PERCENT = SERVER + '%';
const SCHEME = ALPHA + DIGIT + '+-.';
const SCOPE_ID = ALPHANUM + '_.';

/** A character class; `escaped` adds `%XX` escapes and visible non-ASCII ("other") characters. */
interface CharClass {
  chars: string;
  escaped: boolean;
}

const cls = (chars: string, escaped: boolean): CharClass => ({ chars, escaped });
const C_DIGIT = cls(DIGIT, false);
const C_ALPHA = cls(ALPHA, false);
const C_ALPHANUM = cls(ALPHANUM, false);
const C_ALPHANUM_DASH = cls(ALPHANUM + '-', false);
const C_DIGIT_DOT = cls(DIGIT + '.', false);
const C_SCHEME = cls(SCHEME, false);
const C_PATH = cls(PATH, true);
const C_URIC = cls(URIC, true);
const C_USERINFO = cls(USERINFO, true);
const C_REG_NAME = cls(REG_NAME, true);
const C_SERVER = cls(SERVER, true);
const C_SERVER_PERCENT = cls(SERVER_PERCENT, true);
const C_SCOPE_ID = cls(SCOPE_ID, false);

/** `Character.isSpaceChar` (Zs, Zl, Zp). */
const SPACE_CHAR = /[\p{Zs}\p{Zl}\p{Zp}]/u;

/** `Character.isISOControl`. */
const isIsoControl = (c: number): boolean => c <= 0x1f || (c >= 0x7f && c <= 0x9f);

class Parser {
  scheme: string | null = null;
  host: string | null = null;

  constructor(private readonly input: string) {}

  private fail(reason: string, p: number): never {
    throw new UriSyntaxError(`${reason} at index ${p}: ${this.input}`, p);
  }

  private failExpected(expected: string, p: number): never {
    this.fail(`Expected ${expected}`, p);
  }

  private at(start: number, end: number, c: string): boolean {
    return start < end && this.input[start] === c;
  }

  /** `scan(start, end, err, stop)`: index of the first `stop` char, or -1 if an `err` char comes first. */
  private scanStop(start: number, end: number, err: string, stop: string): number {
    let p = start;
    while (p < end) {
      const c = this.input[p]!;
      if (err.includes(c)) {
        return -1;
      }
      if (stop.includes(c)) {
        break;
      }
      p++;
    }
    return p;
  }

  /** `scan(start, end, char)`: one occurrence of `c`. */
  private scanChar(start: number, end: number, c: string): number {
    return start < end && this.input[start] === c ? start + 1 : start;
  }

  private scanEscape(p: number, n: number, c: string): number {
    if (c === '%') {
      if (p + 3 <= n && HEX.includes(this.input[p + 1]!) && HEX.includes(this.input[p + 2]!)) {
        return p + 3;
      }
      this.fail('Malformed escape pair', p);
    }
    const code = c.charCodeAt(0);
    if (code > 128 && !SPACE_CHAR.test(c) && !isIsoControl(code)) {
      return p + 1;
    }
    return p;
  }

  /** `scan(start, n, lowMask, highMask)`. */
  private scan(start: number, n: number, k: CharClass): number {
    let p = start;
    while (p < n) {
      const c = this.input[p]!;
      if (c.charCodeAt(0) < 128 && k.chars.includes(c)) {
        p++;
        continue;
      }
      if (k.escaped) {
        const q = this.scanEscape(p, n, c);
        if (q > p) {
          p = q;
          continue;
        }
      }
      break;
    }
    return p;
  }

  private checkChars(start: number, end: number, k: CharClass, what: string): void {
    const p = this.scan(start, end, k);
    if (p < end) {
      this.fail(`Illegal character in ${what}`, p);
    }
  }

  private checkChar(p: number, k: CharClass, what: string): void {
    this.checkChars(p, p + 1, k, what);
  }

  parse(): void {
    const input = this.input;
    const n = input.length;
    let p = this.scanStop(0, n, '/?#', ':');
    if (p >= 0 && this.at(p, n, ':')) {
      if (p === 0) {
        this.failExpected('scheme name', 0);
      }
      this.checkChar(0, C_ALPHA, 'scheme name');
      this.checkChars(1, p, C_SCHEME, 'scheme name');
      this.scheme = input.substring(0, p);
      p++;
      if (this.at(p, n, '/')) {
        p = this.parseHierarchical(p, n);
      } else {
        // opaque URI
        const q = this.scanStop(p, n, '', '#');
        if (q <= p) {
          this.failExpected('scheme-specific part', p);
        }
        this.checkChars(p, q, C_URIC, 'opaque part');
        p = q;
      }
    } else {
      p = this.parseHierarchical(0, n);
    }
    if (this.at(p, n, '#')) {
      this.checkChars(p + 1, n, C_URIC, 'fragment');
      p = n;
    }
    if (p < n) {
      this.fail('End of URI', p);
    }
  }

  private parseHierarchical(start: number, n: number): number {
    let p = start;
    if (this.at(p, n, '/') && this.at(p + 1, n, '/')) {
      p += 2;
      const q = this.scanStop(p, n, '', '/?#');
      if (q > p) {
        p = this.parseAuthority(p, q);
      } else if (q >= n) {
        // Java allows an empty authority before a non-empty path, query or fragment
        this.failExpected('authority', p);
      }
    }
    let q = this.scanStop(p, n, '', '?#');
    this.checkChars(p, q, C_PATH, 'path');
    p = q;
    if (this.at(p, n, '?')) {
      p++;
      q = this.scanStop(p, n, '', '#');
      this.checkChars(p, q, C_URIC, 'query');
      p = q;
    }
    return p;
  }

  private parseAuthority(start: number, n: number): number {
    const p = start;
    let q = p;
    let ex: UriSyntaxError | null = null;
    const serverChars = this.scanStop(p, n, '', ']') > p
      ? this.scan(p, n, C_SERVER_PERCENT) === n
      : this.scan(p, n, C_SERVER) === n;
    const regChars = this.scan(p, n, C_REG_NAME) === n;
    if (regChars && !serverChars) {
      return n;
    }
    if (serverChars) {
      try {
        q = this.parseServer(p, n);
        if (q < n) {
          this.failExpected('end of authority', q);
        }
      } catch (e) {
        if (!(e instanceof UriSyntaxError)) {
          throw e;
        }
        this.host = null;
        ex = e;
        q = p;
      }
    }
    if (q < n) {
      if (regChars) {
        return n;
      }
      if (ex !== null) {
        throw ex;
      }
      this.fail('Illegal character in authority', q);
    }
    return n;
  }

  private parseServer(start: number, n: number): number {
    let p = start;
    let q = this.scanStop(p, n, '/?#', '@');
    if (q >= p && this.at(q, n, '@')) {
      this.checkChars(p, q, C_USERINFO, 'user info');
      p = q + 1;
    }
    if (this.at(p, n, '[')) {
      p++;
      q = this.scanStop(p, n, '/?#', ']');
      if (q > p && this.at(q, n, ']')) {
        const r = this.scanStop(p, q, '', '%');
        if (r > p && r < q) {
          this.parseIpv6Reference(p, r);
          if (r + 1 === q) {
            this.fail('scope id expected', r + 1);
          }
          this.checkChars(r + 1, q, C_SCOPE_ID, 'scope id');
        } else {
          this.parseIpv6Reference(p, q);
        }
        this.host = this.input.substring(p - 1, q + 1);
        p = q + 1;
      } else {
        this.failExpected('closing bracket for IPv6 address', q);
      }
    } else {
      q = this.parseIpv4Address(p, n);
      if (q <= p) {
        q = this.parseHostname(p, n);
      }
      p = q;
    }
    if (this.at(p, n, ':')) {
      p++;
      q = this.scan(p, n, C_DIGIT);
      if (q > p) {
        // Integer.parseInt: more than 2^31-1 is "Malformed port number"
        if (Number(this.input.substring(p, q)) > 2147483647) {
          this.fail('Malformed port number', p);
        }
        p = q;
      }
    }
    if (p < n) {
      this.failExpected('port number', p);
    }
    return p;
  }

  /** `scanByte`: up to three digits with a value of at most 255. */
  private scanByte(start: number, n: number): number {
    const q = this.scan(start, n, C_DIGIT);
    if (q <= start) {
      return q;
    }
    if (Number(this.input.substring(start, q)) > 255) {
      return start;
    }
    return q;
  }

  /** `scanIPv4Address(start, n, false)`; -1 where Java throws. */
  private scanIpv4Address(start: number, n: number): number {
    let p = start;
    const m = this.scan(p, n, C_DIGIT_DOT);
    if (m <= p) {
      return -1;
    }
    for (let i = 0; i < 4; i++) {
      if (i > 0) {
        const dot = this.scanChar(p, m, '.');
        if (dot <= p) {
          return -1;
        }
        p = dot;
      }
      const q = this.scanByte(p, m);
      if (q <= p) {
        return -1;
      }
      p = q;
    }
    return p < m ? -1 : p;
  }

  private parseIpv4Address(start: number, n: number): number {
    let p = this.scanIpv4Address(start, n);
    if (p > start && p < n && this.input[p] !== ':') {
      p = -1;
    }
    if (p > start) {
      this.host = this.input.substring(start, p);
    }
    return p;
  }

  private parseHostname(start: number, n: number): number {
    let p = start;
    let l = -1;
    do {
      let q = this.scan(p, n, C_ALPHANUM);
      if (q <= p) {
        break;
      }
      l = p;
      p = q;
      q = this.scan(p, n, C_ALPHANUM_DASH);
      if (q > p) {
        if (this.input[q - 1] === '-') {
          this.fail('Illegal character in hostname', q - 1);
        }
        p = q;
      }
      q = this.scanChar(p, n, '.');
      if (q <= p) {
        break;
      }
      p = q;
    } while (p < n);
    if (p < n && !this.at(p, n, ':')) {
      this.fail('Illegal character in hostname', p);
    }
    if (l < 0) {
      this.failExpected('hostname', start);
    }
    if (l > start && !ALPHA.includes(this.input[l]!)) {
      this.fail('Illegal character in hostname', l);
    }
    this.host = this.input.substring(start, p);
    return p;
  }

  /**
   * `parseIPv6Reference`: hex groups separated by colons, at most one `::`, optionally ending in an
   * IPv4 address, at most 8 groups (6 before an IPv4 tail).
   */
  private parseIpv6Reference(start: number, n: number): void {
    const text = this.input.substring(start, n);
    const ipv4 = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
    let groupsText = text;
    let tailGroups = 0;
    if (ipv4) {
      if (ipv4[2]!.split('.').some((b) => Number(b) > 255)) {
        this.fail('Malformed IPv6 address', start);
      }
      groupsText = ipv4[1]!.endsWith('::') ? ipv4[1]! : ipv4[1]!.slice(0, -1);
      tailGroups = 2;
    }
    const halves = groupsText.split('::');
    if (halves.length > 2) {
      this.fail('Malformed IPv6 address', start);
    }
    const hex = /^[0-9A-Fa-f]{1,4}$/;
    const groups = halves.flatMap((h) => (h === '' ? [] : h.split(':')));
    if (!groups.every((g) => hex.test(g))) {
      this.fail('Malformed IPv6 address', start);
    }
    const count = groups.length + tailGroups;
    if (halves.length === 1 ? count !== 8 : count > 7) {
      this.fail('Malformed IPv6 address', start);
    }
  }
}

/** `new URI(s)`; throws `UriSyntaxError` where Java throws `URISyntaxException`. */
export function parseJavaUri(s: string): ParsedUri {
  const parser = new Parser(s);
  parser.parse();
  return { scheme: parser.scheme, host: parser.host };
}
