/**
 * The two Jackson (`Converters.getObjectMapper()`) operations the study-material code relies on, with
 * Jackson's behavior rather than `JSON.parse`/`JSON.stringify`'s:
 *
 * - `readStringList`: `readValue(text, List<String>)`. Lenient where JSON.parse is strict: text after the
 *   root value is never read, numbers and booleans become their text. Strict where JSON.parse is lenient:
 *   only space, tab, CR and LF count as whitespace (a BOM fails). `null` at the root gives null.
 * - `writeStringList`: `writeValueAsString(List<String>)`. Control chars escape as `\b \t \n \f \r` or
 *   `\u00XX` with upper-case hex; lone surrogates and everything else are written as they are.
 */

import { JavaException } from '../kana';

/** Thrown where Jackson throws (`JsonProcessingException` and subclasses). */
export class JacksonError extends JavaException {
  constructor(message: string) {
    super('JsonProcessingException', message);
  }
}

const WS = new Set([' ', '\t', '\n', '\r']);

class Reader {
  i = 0;
  constructor(readonly s: string) {}

  skipWs(): void {
    while (this.i < this.s.length && WS.has(this.s[this.i] as string)) this.i++;
  }

  fail(what: string): never {
    throw new JacksonError(`${what} at ${this.i}`);
  }

  /** A string token; `this.i` is at the opening quote. */
  string(): string {
    let out = '';
    this.i++;
    for (;;) {
      if (this.i >= this.s.length) this.fail('unterminated string');
      const c = this.s.charCodeAt(this.i++);
      if (c === 0x22) return out;
      if (c < 0x20) this.fail('unescaped control char');
      if (c !== 0x5c) {
        out += String.fromCharCode(c);
        continue;
      }
      if (this.i >= this.s.length) this.fail('unterminated escape');
      const e = this.s[this.i++];
      switch (e) {
        case '"':
        case '\\':
        case '/':
          out += e;
          break;
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case 'n':
          out += '\n';
          break;
        case 'r':
          out += '\r';
          break;
        case 't':
          out += '\t';
          break;
        case 'u': {
          const hex = this.s.slice(this.i, this.i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('bad unicode escape');
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 4;
          break;
        }
        default:
          this.fail('bad escape');
      }
    }
  }

  /** A number token, returned as its text (what Jackson's String deserializer gives back). */
  number(): string {
    const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.s.slice(this.i));
    if (!m || m[0] === '-' || m[0] === '') this.fail('bad number');
    const text = m[0];
    this.i += text.length;
    // Jackson rejects a number run straight into a letter or digit, e.g. "01" or "1x".
    const next = this.s[this.i];
    if (next !== undefined && /[0-9A-Za-z_.]/.test(next)) this.fail('bad number');
    return text;
  }

  literal(word: string): void {
    if (this.s.startsWith(word, this.i)) {
      this.i += word.length;
      const next = this.s[this.i];
      if (next !== undefined && /[0-9A-Za-z_]/.test(next)) this.fail('bad literal');
      return;
    }
    this.fail('unexpected token');
  }

  /** One array element as `List<String>` sees it: a string, a scalar's text, or null. */
  element(): string | null {
    const c = this.s[this.i];
    if (c === '"') return this.string();
    if (c === 'n') {
      this.literal('null');
      return null;
    }
    if (c === 't') {
      this.literal('true');
      return 'true';
    }
    if (c === 'f') {
      this.literal('false');
      return 'false';
    }
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return this.number();
    // Arrays and objects can't become a String (MismatchedInputException).
    return this.fail('unexpected element');
  }
}

/** Jackson `readValue(text, new TypeReference<List<String>>() {})`; null for a root `null`. */
export function readStringList(text: string): (string | null)[] | null {
  const r = new Reader(text);
  r.skipWs();
  if (r.i >= text.length) r.fail('no content');
  if (text[r.i] === 'n') {
    r.literal('null');
    return null;
  }
  if (text[r.i] !== '[') r.fail('not an array');
  r.i++;
  const out: (string | null)[] = [];
  r.skipWs();
  if (text[r.i] === ']') return out;
  for (;;) {
    r.skipWs();
    if (r.i >= text.length) r.fail('unterminated array');
    out.push(r.element());
    r.skipWs();
    const c = text[r.i++];
    if (c === ']') return out;
    if (c !== ',') r.fail('expected , or ]');
  }
}

const HEX = '0123456789ABCDEF';
const SHORT: Record<number, string> = { 0x08: '\\b', 0x09: '\\t', 0x0a: '\\n', 0x0c: '\\f', 0x0d: '\\r' };

/** Jackson's quoting of one string value. */
export function writeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += '\\\\';
    else if (c < 0x20) out += SHORT[c] ?? `\\u00${HEX[c >> 4]}${HEX[c & 15]}`;
    else out += s[i];
  }
  return `${out}"`;
}

/** Jackson `writeValueAsString(List<String>)`, null elements as `null`. */
export function writeStringList(list: readonly (string | null)[]): string {
  return `[${list.map((s) => (s === null ? 'null' : writeString(s))).join(',')}]`;
}
