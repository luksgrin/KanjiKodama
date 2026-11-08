/**
 * The number conversions Android's `org.json` relies on: parsing doubles and 64-bit integers (with a
 * radix), printing doubles, and the narrowing behind `intValue()` and `longValue()`. Kept separate
 * so the JSON port stays readable.
 */

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
export const LONG_MIN = -(2n ** 63n);
export const LONG_MAX = 2n ** 63n - 1n;

/** A malformed number (`NumberFormatException`), raised by the parsers below. */
export class NumberFormatError extends Error {}

/** `(int) d` for a double: truncates toward zero, NaN is 0, out-of-range values saturate. */
export function doubleToInt(d: number): number {
  if (Number.isNaN(d)) return 0;
  if (d >= INT_MAX) return INT_MAX;
  if (d <= INT_MIN) return INT_MIN;
  return Math.trunc(d);
}

/** `(long) d` for a double, as a bigint: truncates toward zero, NaN is 0, saturates. */
export function doubleToLong(d: number): bigint {
  if (Number.isNaN(d)) return 0n;
  if (d >= 9223372036854775807) return LONG_MAX;
  if (d <= -9223372036854775808) return LONG_MIN;
  return BigInt(Math.trunc(d));
}

/** The low 32 bits. */
export function longToInt(v: bigint): number {
  return Number(BigInt.asIntN(32, v));
}

/** A digit's value in `radix`: Unicode decimal digits and Latin letters count. */
function digit(c: string, radix: number): number {
  const code = c.charCodeAt(0);
  let value = -1;
  if (/\p{Nd}/u.test(c)) {
    // Decimal digits come in runs of ten starting at the zero.
    let zero = code;
    while (zero > 0 && /\p{Nd}/u.test(String.fromCharCode(zero - 1)) && code - zero < 9) zero--;
    value = (code - zero) % 10;
  } else if (code >= 0x41 && code <= 0x5a) value = code - 0x41 + 10;
  else if (code >= 0x61 && code <= 0x7a) value = code - 0x61 + 10;
  else if (code >= 0xff21 && code <= 0xff3a) value = code - 0xff21 + 10;
  else if (code >= 0xff41 && code <= 0xff5a) value = code - 0xff41 + 10;
  return value < radix ? value : -1;
}

/** A 64-bit integer in `radix`, as a bigint; throws `NumberFormatError`. */
export function parseLong(s: string, radix: number): bigint {
  if (s.length === 0) throw new NumberFormatError(`For input string: "${s}"`);
  let i = 0;
  let negative = false;
  const first = s[0];
  if (first === '-' || first === '+') {
    negative = first === '-';
    if (s.length === 1) throw new NumberFormatError(`For input string: "${s}"`);
    i = 1;
  }
  let result = 0n;
  const r = BigInt(radix);
  for (; i < s.length; i++) {
    const d = digit(s.charAt(i), radix);
    if (d < 0) throw new NumberFormatError(`For input string: "${s}"`);
    result = result * r + BigInt(d);
    if (result > LONG_MAX + 1n) throw new NumberFormatError(`For input string: "${s}"`);
  }
  if (negative) result = -result;
  if (result > LONG_MAX || result < LONG_MIN) throw new NumberFormatError(`For input string: "${s}"`);
  return result;
}

const DEC_FLOAT = /^[+-]?(NaN|Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?)$/;
const HEX_FLOAT = /^([+-]?)0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?[pP]([+-]?\d+)[fFdD]?$/;

/** Parses a double: trims chars <= U+0020, accepts the usual float syntax (`1e5`, `0x1p3`, `NaN`, `Infinity`, an `f`/`d` suffix); throws `NumberFormatError`. */
export function parseDouble(input: string): number {
  let start = 0;
  let end = input.length;
  while (start < end && input.charCodeAt(start) <= 0x20) start++;
  while (end > start && input.charCodeAt(end - 1) <= 0x20) end--;
  const s = input.slice(start, end);
  if (DEC_FLOAT.test(s)) {
    const body = s.replace(/[fFdD]$/, '');
    if (body.endsWith('NaN')) return Number.NaN;
    if (body.endsWith('Infinity')) return body.startsWith('-') ? -Infinity : Infinity;
    return Number(body);
  }
  const hex = HEX_FLOAT.exec(s);
  if (hex && ((hex[2] ?? '') + (hex[3] ?? '')).length > 0) {
    const mantissa = parseInt((hex[2] ?? '') + (hex[3] ?? '') || '0', 16);
    const exponent = Number(hex[4]) - 4 * (hex[3] ?? '').length;
    const value = mantissa * 2 ** exponent;
    return hex[1] === '-' ? -value : value;
  }
  throw new NumberFormatError(s.length === 0 ? 'empty String' : `For input string: "${s}"`);
}

/** Shortest digits, plain between 10^-3 and 10^7, otherwise `1.0E10` style. */
export function doubleToString(d: number): string {
  if (Number.isNaN(d)) return 'NaN';
  if (d === Infinity) return 'Infinity';
  if (d === -Infinity) return '-Infinity';
  if (d === 0) return Object.is(d, -0) ? '-0.0' : '0.0';
  const abs = Math.abs(d);
  const sign = d < 0 ? '-' : '';
  if (abs >= 1e-3 && abs < 1e7) {
    const s = abs.toString();
    return sign + (s.includes('.') ? s : `${s}.0`);
  }
  // Scientific: JS gives "1.2345e+21" / "1e-7".
  const [mant = '', exp = ''] = abs.toExponential().split('e');
  return `${sign}${mant.includes('.') ? mant : `${mant}.0`}E${Number(exp)}`;
}
