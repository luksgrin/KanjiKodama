/**
 * A port of Android's `org.json` (libcore: `JSONTokener`, `JSONObject`, `JSONArray`, `JSONStringer`,
 * `JSON`), the parser and writer behind `local/ProgressStore`. Its leniency is part of the file
 * format: comments, single quotes, unquoted strings, `=`/`=>`/`;` separators, a BOM and trailing
 * garbage are accepted; numbers keep Java's Integer/Long/Double distinction; error texts are the
 * Java ones (`progress/describe.json` records them).
 */

import {
  doubleToInt,
  doubleToLong,
  doubleToString,
  longToInt,
  NumberFormatError,
  parseDouble,
  parseLong,
} from './javaNumbers';

/** A Java exception: `javaClass` is its class name, `message` its `getMessage()`. */
export class JavaException extends Error {
  constructor(readonly javaClass: string, message: string) {
    super(message);
  }
}

/** `org.json.JSONException`. */
export function jsonException(message: string): JavaException {
  return new JavaException('org.json.JSONException', message);
}

/** A boxed Java number as `org.json` produces it. */
export class JavaNumber {
  private constructor(readonly type: 'Integer' | 'Long' | 'Double', readonly value: number | bigint) {}
  static int(v: number): JavaNumber {
    return new JavaNumber('Integer', v | 0);
  }
  static long(v: bigint): JavaNumber {
    return new JavaNumber('Long', BigInt.asIntN(64, v));
  }
  static double(v: number): JavaNumber {
    return new JavaNumber('Double', v);
  }
  doubleValue(): number {
    return Number(this.value);
  }
  intValue(): number {
    if (this.type === 'Integer') return this.value as number;
    if (this.type === 'Long') return longToInt(this.value as bigint);
    return doubleToInt(this.value as number);
  }
  longValue(): bigint {
    if (this.type === 'Double') return doubleToLong(this.value as number);
    return BigInt(this.value);
  }
  /** `Number.toString()`. */
  toString(): string {
    return this.type === 'Double' ? doubleToString(this.value as number) : String(this.value);
  }
}

/** `JSONObject.NULL`. */
export const JSON_NULL: unique symbol = Symbol('JSONObject.NULL');

/** `org.json.JSONObject`: insertion-ordered (Java's `LinkedHashMap`). */
export class JSONObject {
  readonly map = new Map<string, JsonValue>();
}

/** `org.json.JSONArray`. */
export class JSONArray {
  readonly values: (JsonValue | null)[] = [];
}

export type JsonValue = string | boolean | JavaNumber | JSONObject | JSONArray | typeof JSON_NULL;

/** `value.getClass().getName()`. */
export function javaClassName(value: JsonValue): string {
  if (typeof value === 'string') return 'java.lang.String';
  if (typeof value === 'boolean') return 'java.lang.Boolean';
  if (value === JSON_NULL) return 'org.json.JSONObject$1';
  if (value instanceof JavaNumber) return `java.lang.${value.type}`;
  if (value instanceof JSONObject) return 'org.json.JSONObject';
  return 'org.json.JSONArray';
}

/** `String.valueOf(value)` (`JSONObject`/`JSONArray` print compact JSON; null if that fails). */
export function javaToString(value: JsonValue | null): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || value instanceof JavaNumber) return String(value);
  if (value === JSON_NULL) return 'null';
  return toJsonString(value) ?? 'null';
}

/** `JSON.typeMismatch(actual, requiredType)`. */
function typeMismatch(actual: JsonValue | null, requiredType: string): JavaException {
  if (actual === null) return jsonException('Value is null.');
  return jsonException(`Value ${javaToString(actual)} of type ${javaClassName(actual)} cannot be converted to ${requiredType}`);
}

/** `JSON.typeMismatch(indexOrName, actual, requiredType)`. */
function typeMismatchAt(at: string | number, actual: JsonValue | null, requiredType: string): JavaException {
  if (actual === null) return jsonException(`Value at ${at} is null.`);
  return jsonException(
    `Value ${javaToString(actual)} at ${at} of type ${javaClassName(actual)} cannot be converted to ${requiredType}`,
  );
}

/** `JSON.checkDouble`. */
function checkDouble(d: number): void {
  if (!Number.isFinite(d)) throw jsonException(`Forbidden numeric value: ${doubleToString(d)}`);
}

/** `JSONTokener`. */
class Tokener {
  private pos = 0;
  private readonly in: string;

  constructor(input: string) {
    this.in = input.startsWith('﻿') ? input.slice(1) : input;
  }

  nextValue(): JsonValue {
    const c = this.nextCleanInternal();
    switch (c) {
      case -1:
        throw this.syntaxError('End of input');
      case 0x7b: // {
        return this.readObject();
      case 0x5b: // [
        return this.readArray();
      case 0x27: // '
      case 0x22: // "
        return this.nextString(String.fromCharCode(c));
      default:
        this.pos--;
        return this.readLiteral();
    }
  }

  private nextCleanInternal(): number {
    while (this.pos < this.in.length) {
      const c = this.in.charCodeAt(this.pos++);
      switch (c) {
        case 0x09:
        case 0x20:
        case 0x0a:
        case 0x0d:
          continue;
        case 0x2f: {
          // '/'
          if (this.pos === this.in.length) return c;
          const peek = this.in.charAt(this.pos);
          if (peek === '*') {
            this.pos++;
            const commentEnd = this.in.indexOf('*/', this.pos);
            if (commentEnd === -1) throw this.syntaxError('Unterminated comment');
            this.pos = commentEnd + 2;
            continue;
          }
          if (peek === '/') {
            this.pos++;
            this.skipToEndOfLine();
            continue;
          }
          return c;
        }
        case 0x23: // '#'
          this.skipToEndOfLine();
          continue;
        default:
          return c;
      }
    }
    return -1;
  }

  private skipToEndOfLine(): void {
    for (; this.pos < this.in.length; this.pos++) {
      const c = this.in.charAt(this.pos);
      if (c === '\r' || c === '\n') {
        this.pos++;
        break;
      }
    }
  }

  private nextString(quote: string): string {
    let builder = '';
    let start = this.pos;
    while (this.pos < this.in.length) {
      const c = this.in.charAt(this.pos++);
      if (c === quote) {
        return builder + this.in.slice(start, this.pos - 1);
      }
      if (c === '\\') {
        if (this.pos === this.in.length) throw this.syntaxError('Unterminated escape sequence');
        builder += this.in.slice(start, this.pos - 1);
        builder += this.readEscapeCharacter();
        start = this.pos;
      }
    }
    throw this.syntaxError('Unterminated string');
  }

  private readEscapeCharacter(): string {
    const escaped = this.in.charAt(this.pos++);
    switch (escaped) {
      case 'u': {
        if (this.pos + 4 > this.in.length) throw this.syntaxError('Unterminated escape sequence');
        const hex = this.in.slice(this.pos, this.pos + 4);
        this.pos += 4;
        // Integer.parseInt(hex, 16): an optional sign, then hex digits.
        if (!/^[+-]?[0-9a-fA-F]+$/.test(hex)) throw this.syntaxError(`Invalid escape sequence: ${hex}`);
        return String.fromCharCode(parseInt(hex, 16) & 0xffff);
      }
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 'f':
        return '\f';
      default:
        return escaped;
    }
  }

  private readLiteral(): JsonValue {
    const literal = this.nextToInternal('{}[]/\\:,=;# \t\f');
    if (literal.length === 0) throw this.syntaxError('Expected literal value');
    const lower = literal.toLowerCase();
    if (lower === 'null') return JSON_NULL;
    if (lower === 'true') return true;
    if (lower === 'false') return false;

    if (literal.indexOf('.') === -1) {
      let base = 10;
      let number = literal;
      if (number.startsWith('0x') || number.startsWith('0X')) {
        number = number.slice(2);
        base = 16;
      } else if (number.startsWith('0') && number.length > 1) {
        number = number.slice(1);
        base = 8;
      }
      try {
        const longValue = parseLong(number, base);
        if (longValue <= 2147483647n && longValue >= -2147483648n) return JavaNumber.int(Number(longValue));
        return JavaNumber.long(longValue);
      } catch (e) {
        if (!(e instanceof NumberFormatError)) throw e;
      }
    }
    try {
      return JavaNumber.double(parseDouble(literal));
    } catch (e) {
      if (!(e instanceof NumberFormatError)) throw e;
    }
    return literal;
  }

  private nextToInternal(excluded: string): string {
    const start = this.pos;
    for (; this.pos < this.in.length; this.pos++) {
      const c = this.in.charAt(this.pos);
      if (c === '\r' || c === '\n' || excluded.indexOf(c) !== -1) return this.in.slice(start, this.pos);
    }
    return this.in.slice(start);
  }

  private readObject(): JSONObject {
    const result = new JSONObject();
    const first = this.nextCleanInternal();
    if (first === 0x7d) return result;
    if (first !== -1) this.pos--;
    for (;;) {
      const name = this.nextValue();
      if (typeof name !== 'string') {
        throw this.syntaxError(`Names must be strings, but ${javaToString(name)} is of type ${javaClassName(name)}`);
      }
      const separator = this.nextCleanInternal();
      if (separator !== 0x3a && separator !== 0x3d) throw this.syntaxError(`Expected ':' after ${name}`);
      if (this.pos < this.in.length && this.in.charAt(this.pos) === '>') this.pos++;
      put(result, name, this.nextValue());
      switch (this.nextCleanInternal()) {
        case 0x7d:
          return result;
        case 0x3b:
        case 0x2c:
          continue;
        default:
          throw this.syntaxError('Unterminated object');
      }
    }
  }

  private readArray(): JSONArray {
    const result = new JSONArray();
    let hasTrailingSeparator = false;
    for (;;) {
      switch (this.nextCleanInternal()) {
        case -1:
          throw this.syntaxError('Unterminated array');
        case 0x5d:
          if (hasTrailingSeparator) result.values.push(null);
          return result;
        case 0x2c:
        case 0x3b:
          result.values.push(null);
          hasTrailingSeparator = true;
          continue;
        default:
          this.pos--;
      }
      result.values.push(this.nextValue());
      switch (this.nextCleanInternal()) {
        case 0x5d:
          return result;
        case 0x2c:
        case 0x3b:
          hasTrailingSeparator = true;
          continue;
        default:
          throw this.syntaxError('Unterminated array');
      }
    }
  }

  private syntaxError(message: string): JavaException {
    return jsonException(`${message} at character ${this.pos} of ${this.in}`);
  }
}

/** `JSONObject.put(name, value)` for a parsed value (numbers must be finite). */
function put(o: JSONObject, name: string, value: JsonValue): void {
  if (value instanceof JavaNumber) checkDouble(value.doubleValue());
  o.map.set(name, value);
}

/** `new JSONTokener(text).nextValue()`. */
export function parseJsonValue(text: string): JsonValue {
  return new Tokener(text).nextValue();
}

/** `new JSONObject(text)`. */
export function parseJsonObject(text: string): JSONObject {
  const value = parseJsonValue(text);
  if (value instanceof JSONObject) return value;
  throw typeMismatch(value, 'JSONObject');
}

// --- JSON coercions (libcore `JSON`) ---

function toInteger(value: JsonValue | null | undefined): number | null {
  if (value instanceof JavaNumber) return value.intValue();
  if (typeof value === 'string') {
    try {
      return doubleToInt(parseDouble(value));
    } catch (e) {
      if (!(e instanceof NumberFormatError)) throw e;
    }
  }
  return null;
}

function toLong(value: JsonValue | null | undefined): bigint | null {
  if (value instanceof JavaNumber) return value.longValue();
  if (typeof value === 'string') {
    try {
      return doubleToLong(parseDouble(value));
    } catch (e) {
      if (!(e instanceof NumberFormatError)) throw e;
    }
  }
  return null;
}

// --- JSONObject accessors ---

/** `JSONObject.opt(name)`. */
export function opt(o: JSONObject, name: string): JsonValue | undefined {
  return o.map.get(name);
}

/** `JSONObject.has(name)`. */
export function has(o: JSONObject, name: string): boolean {
  return o.map.has(name);
}

/** `JSONObject.optString(name, fallback)`: any non-string value is printed with `String.valueOf`. */
export function optString(o: JSONObject, name: string, fallback = ''): string {
  const value = o.map.get(name);
  return value === undefined ? fallback : javaToString(value);
}

/** `JSONObject.optInt(name, fallback)`. */
export function optInt(o: JSONObject, name: string, fallback = 0): number {
  return toInteger(o.map.get(name)) ?? fallback;
}

/** `JSONObject.optLong(name, fallback)`, as a bigint. */
export function optLong(o: JSONObject, name: string, fallback = 0n): bigint {
  return toLong(o.map.get(name)) ?? fallback;
}

/** `JSONObject.optJSONArray(name)`. */
export function optJSONArray(o: JSONObject, name: string): JSONArray | null {
  const value = o.map.get(name);
  return value instanceof JSONArray ? value : null;
}

/** `JSONObject.getJSONArray(name)`. */
export function getJSONArray(o: JSONObject, name: string): JSONArray {
  const value = o.map.get(name);
  if (value === undefined) throw jsonException(`No value for ${name}`);
  if (value instanceof JSONArray) return value;
  throw typeMismatchAt(name, value, 'JSONArray');
}

// --- JSONArray accessors ---

function arrayGet(a: JSONArray, index: number): JsonValue {
  if (index < 0 || index >= a.values.length) {
    throw jsonException(`Index ${index} out of range [0..${a.values.length})`);
  }
  const value = a.values[index];
  if (value === null || value === undefined) throw jsonException(`Value at ${index} is null.`);
  return value;
}

/** `JSONArray.getJSONObject(index)`. */
export function arrayGetJSONObject(a: JSONArray, index: number): JSONObject {
  const value = arrayGet(a, index);
  if (value instanceof JSONObject) return value;
  throw typeMismatchAt(index, value, 'JSONObject');
}

/** `JSONArray.getJSONArray(index)`. */
export function arrayGetJSONArray(a: JSONArray, index: number): JSONArray {
  const value = arrayGet(a, index);
  if (value instanceof JSONArray) return value;
  throw typeMismatchAt(index, value, 'JSONArray');
}

/** `JSONArray.getLong(index)`, as a bigint. */
export function arrayGetLong(a: JSONArray, index: number): bigint {
  const value = arrayGet(a, index);
  const result = toLong(value);
  if (result === null) throw typeMismatchAt(index, value, 'long');
  return result;
}

/** `JSONArray.getInt(index)`. */
export function arrayGetInt(a: JSONArray, index: number): number {
  const value = arrayGet(a, index);
  const result = toInteger(value);
  if (result === null) throw typeMismatchAt(index, value, 'int');
  return result;
}

// --- Writing (JSONStringer) ---

/** `JSONObject.numberToString`. */
export function numberToString(n: JavaNumber): string {
  const d = n.doubleValue();
  checkDouble(d);
  if (n.type === 'Double' && Object.is(d, -0)) return '-0';
  if (n.type !== 'Double') return n.toString();
  const l = n.longValue();
  if (d === Number(l)) return l.toString();
  return n.toString();
}

/** `JSONStringer.string`: escapes `"`, `\`, `/`, the usual controls and any other char <= U+001F. */
export function quote(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const c = value.charAt(i);
    switch (c) {
      case '"':
      case '\\':
      case '/':
        out += `\\${c}`;
        break;
      case '\t':
        out += '\\t';
        break;
      case '\b':
        out += '\\b';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      case '\f':
        out += '\\f';
        break;
      default:
        out += c.charCodeAt(0) <= 0x1f ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}` : c;
    }
  }
  return `${out}"`;
}

/** Writes `value` like `JSONStringer` with the given indent (null: compact). */
function write(value: JsonValue | null, indent: string | null, depth: number): string {
  if (value === null || value === JSON_NULL) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return quote(value);
  if (value instanceof JavaNumber) return numberToString(value);
  const newline = (d: number): string => (indent === null ? '' : `\n${indent.repeat(d)}`);
  if (value instanceof JSONArray) {
    if (value.values.length === 0) return '[]';
    const parts = value.values.map((v) => newline(depth + 1) + write(v, indent, depth + 1));
    return `[${parts.join(',')}${newline(depth)}]`;
  }
  if (value.map.size === 0) return '{}';
  const sep = indent === null ? ':' : ': ';
  const parts = [...value.map].map(([k, v]) => `${newline(depth + 1)}${quote(k)}${sep}${write(v, indent, depth + 1)}`);
  return `{${parts.join(',')}${newline(depth)}}`;
}

/** `JSONObject.toString()` / `JSONArray.toString()`: compact; null if a value can't be written. */
export function toJsonString(value: JSONObject | JSONArray): string | null {
  try {
    return write(value, null, 0);
  } catch (e) {
    if (e instanceof JavaException) return null;
    throw e;
  }
}

/** `JSONObject.toString(indentSpaces)`. */
export function toIndentedJsonString(value: JSONObject | JSONArray, indentSpaces: number): string {
  return write(value, ' '.repeat(indentSpaces), 0);
}
