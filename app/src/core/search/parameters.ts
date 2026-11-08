/**
 * `model/AdvancedSearchParameters`: the advanced search (and self-study preset) parameters, read
 * from JSON with Jackson's rules (`Converters.getObjectMapper()`, unknown properties ignored) and
 * written back the way the app serializes them.
 *
 * Jackson's coercions are part of the stored format: numbers given as strings are parsed, floats
 * are truncated, enum names must match exactly (or be an index), an explicit `null` for
 * `sortOrder` or a collection keeps the default, and a whole number outside the int range is
 * clamped (`ClampedInteger`). A single string where an array belongs, a bad enum, a string or float
 * out of the int range, or broken JSON fails the whole parse: `JacksonError` with the Java
 * exception's simple class name.
 */

import { SUBJECT_TYPES, type SubjectTypeName } from '../content';
import { hashSetOrder, integerHash, stringHash } from './javaHashSet';

/** `enums/SearchSortOrder`, in declaration (ordinal) order. */
export const SEARCH_SORT_ORDERS = ['TYPE', 'LEVEL_TYPE', 'AVAILABLE_AT_TYPE', 'STAGE_TYPE'] as const;
export type SearchSortOrder = (typeof SEARCH_SORT_ORDERS)[number];

/** `SearchSortOrder.description`, the form's spinner texts. */
export const SORT_ORDER_DESCRIPTIONS: Readonly<Record<SearchSortOrder, string>> = {
  TYPE: 'Type',
  LEVEL_TYPE: 'Level, Type',
  AVAILABLE_AT_TYPE: 'Next review, Type',
  STAGE_TYPE: 'SRS Stage, Type',
};

/**
 * The parameters. Collections are arrays in the Java collection's iteration order (`HashSet` for
 * the form's, Jackson's list order for parsed ones); search only tests membership.
 */
export interface AdvancedSearchParameters {
  minLevel: number | null;
  maxLevel: number | null;
  minFrequency: number | null;
  maxFrequency: number | null;
  leechesOnly: boolean;
  upcomingReviewLessThan: number | null;
  upcomingReviewMoreThan: number | null;
  incorrectAnswerWithin: number | null;
  burnedLessThan: number | null;
  burnedMoreThan: number | null;
  sortOrder: SearchSortOrder;
  /** Elements may be null when a preset says so (Jackson keeps them; the search then fails). */
  starRatings: (number | null)[];
  srsStages: (string | null)[];
  itemTypes: SubjectTypeName[];
  jlptLevels: (number | null)[];
  joyoGrades: (number | null)[];
}

/** `new AdvancedSearchParameters()`. */
export function defaultParameters(): AdvancedSearchParameters {
  return {
    minLevel: null,
    maxLevel: null,
    minFrequency: null,
    maxFrequency: null,
    leechesOnly: false,
    upcomingReviewLessThan: null,
    upcomingReviewMoreThan: null,
    incorrectAnswerWithin: null,
    burnedLessThan: null,
    burnedMoreThan: null,
    sortOrder: 'TYPE',
    starRatings: [],
    srsStages: [],
    itemTypes: [],
    jlptLevels: [],
    joyoGrades: [],
  };
}

/** A failed Jackson read; `javaClass` is the exception's simple name (`InvalidFormatException`, …). */
export class JacksonError extends Error {
  constructor(readonly javaClass: string, message: string) {
    super(message);
  }
}

// --- A strict JSON reader with Jackson's token types ---

type Token =
  | { kind: 'object'; entries: [string, Token][] }
  | { kind: 'array'; items: Token[] }
  | { kind: 'string'; value: string }
  | { kind: 'int'; value: bigint; text: string }
  | { kind: 'float'; value: number; text: string }
  | { kind: 'true' }
  | { kind: 'false' }
  | { kind: 'null' };

class JsonReader {
  private i = 0;
  constructor(private readonly s: string) {}

  /** The root value, or null when the input has no token at all. */
  readRoot(): Token | null {
    this.ws();
    if (this.i >= this.s.length) return null;
    return this.value();
  }

  private ws(): void {
    while (this.i < this.s.length) {
      const c = this.s.charCodeAt(this.i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.i++;
      else break;
    }
  }

  private eof(): never {
    throw new JacksonError('JsonEOFException', 'Unexpected end-of-input');
  }

  private fail(message: string): never {
    throw new JacksonError('JsonParseException', message);
  }

  private value(): Token {
    this.ws();
    if (this.i >= this.s.length) this.eof();
    const c = this.s.charAt(this.i);
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"') return { kind: 'string', value: this.string() };
    if (c === '-' || (c >= '0' && c <= '9')) return this.number();
    for (const [word, kind] of [['true', 'true'], ['false', 'false'], ['null', 'null']] as const) {
      if (this.s.startsWith(word, this.i)) {
        this.i += word.length;
        const next = this.s.charAt(this.i);
        if (/[A-Za-z0-9_$]/.test(next)) this.fail(`Unrecognized token`);
        return { kind };
      }
      if (word.startsWith(this.s.slice(this.i)) && this.i < this.s.length) this.eof();
    }
    this.fail(`Unexpected character '${c}'`);
  }

  private object(): Token {
    this.i++;
    const entries: [string, Token][] = [];
    this.ws();
    if (this.i >= this.s.length) this.eof();
    if (this.s.charAt(this.i) === '}') {
      this.i++;
      return { kind: 'object', entries };
    }
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) this.eof();
      if (this.s.charAt(this.i) !== '"') this.fail('Unexpected character: was expecting double-quote to start field name');
      const name = this.string();
      this.ws();
      if (this.i >= this.s.length) this.eof();
      if (this.s.charAt(this.i) !== ':') this.fail("Unexpected character: was expecting a colon to separate field name and value");
      this.i++;
      entries.push([name, this.value()]);
      this.ws();
      if (this.i >= this.s.length) this.eof();
      const c = this.s.charAt(this.i++);
      if (c === '}') return { kind: 'object', entries };
      if (c !== ',') this.fail("Unexpected character: was expecting comma to separate Object entries");
    }
  }

  private array(): Token {
    this.i++;
    const items: Token[] = [];
    this.ws();
    if (this.i >= this.s.length) this.eof();
    if (this.s.charAt(this.i) === ']') {
      this.i++;
      return { kind: 'array', items };
    }
    for (;;) {
      items.push(this.value());
      this.ws();
      if (this.i >= this.s.length) this.eof();
      const c = this.s.charAt(this.i++);
      if (c === ']') return { kind: 'array', items };
      if (c !== ',') this.fail('Unexpected character: was expecting comma to separate Array entries');
    }
  }

  private string(): string {
    this.i++;
    let out = '';
    for (;;) {
      if (this.i >= this.s.length) this.eof();
      const c = this.s.charAt(this.i++);
      if (c === '"') return out;
      if (c.charCodeAt(0) < 0x20) this.fail('Illegal unquoted character');
      if (c !== '\\') {
        out += c;
        continue;
      }
      if (this.i >= this.s.length) this.eof();
      const e = this.s.charAt(this.i++);
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
          if (hex.length < 4) this.eof();
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('Unexpected character in unicode escape');
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 4;
          break;
        }
        default:
          this.fail(`Unrecognized character escape '${e}'`);
      }
    }
  }

  private number(): Token {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.i));
    if (!m) {
      if (this.s.slice(this.i) === '-') this.eof();
      this.fail('Invalid numeric value');
    }
    const text = m[0];
    const after = this.s.charAt(this.i + text.length);
    if (/[0-9.eE]/.test(after) && after !== '') this.fail('Invalid numeric value: leading zeroes or malformed number');
    this.i += text.length;
    if (m[2] === undefined && m[3] === undefined) return { kind: 'int', value: BigInt(text), text };
    return { kind: 'float', value: Number(text), text };
  }
}

// --- Jackson coercions ---

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/** Java `String.trim`. */
function javaTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.slice(start, end);
}

const DIGIT = /\p{Nd}/u;

/** `Integer.parseInt(s)`/`Long.parseLong(s)` (sign, Unicode decimal digits), as a bigint; null if it doesn't parse. */
function javaParseInteger(s: string): bigint | null {
  let i = 0;
  let negative = false;
  if (s[0] === '+' || s[0] === '-') {
    negative = s[0] === '-';
    i = 1;
  }
  if (i >= s.length) return null;
  let v = 0n;
  for (; i < s.length; i++) {
    const c = s.charAt(i);
    if (!DIGIT.test(c)) return null;
    let zero = c.charCodeAt(0);
    while (DIGIT.test(String.fromCharCode(zero - 1)) && c.charCodeAt(0) - zero < 9) zero--;
    v = v * 10n + BigInt((c.charCodeAt(0) - zero) % 10);
  }
  return negative ? -v : v;
}

/** `ClampedInteger.deserialize` (and Jackson's `Integer` deserializer it falls back to). */
function readInteger(t: Token): number | null {
  switch (t.kind) {
    case 'null':
      return null;
    case 'int':
      if (t.value > BigInt(INT_MAX)) return INT_MAX;
      if (t.value < BigInt(INT_MIN)) return INT_MIN;
      return Number(t.value);
    case 'float':
      if (t.value < INT_MIN || t.value > INT_MAX || Number.isNaN(t.value)) {
        throw new JacksonError('JsonMappingException', `Numeric value (${t.text}) out of range of int`);
      }
      return Math.trunc(t.value);
    case 'string': {
      const text = javaTrim(t.value);
      if (text.length === 0 || text === 'null') return null;
      const v = javaParseInteger(text);
      if (v === null || v > BigInt(INT_MAX) || v < BigInt(INT_MIN)) {
        throw new JacksonError('InvalidFormatException', `Cannot deserialize value of type \`java.lang.Integer\` from String "${t.value}"`);
      }
      return Number(v);
    }
    default:
      throw new JacksonError('MismatchedInputException', `Cannot deserialize value of type \`java.lang.Integer\` from ${t.kind}`);
  }
}

/** Jackson's primitive `boolean`. */
function readBoolean(t: Token): boolean {
  switch (t.kind) {
    case 'true':
      return true;
    case 'false':
    case 'null':
      return false;
    case 'int':
      return t.value !== 0n;
    case 'string': {
      const text = javaTrim(t.value);
      if (text === 'true' || text === 'True' || text === 'TRUE') return true;
      if (text === 'false' || text === 'False' || text === 'FALSE' || text === '' || text === 'null') return false;
      throw new JacksonError('InvalidFormatException', `Cannot deserialize value of type \`boolean\` from String "${t.value}"`);
    }
    default:
      throw new JacksonError('MismatchedInputException', `Cannot deserialize value of type \`boolean\` from ${t.kind}`);
  }
}

/** An enum by exact name, or by index. */
function readEnum<T extends string>(t: Token, values: readonly T[], type: string): T {
  if (t.kind === 'string') {
    const found = values.find((v) => v === t.value);
    if (found !== undefined) return found;
    throw new JacksonError('InvalidFormatException', `Cannot deserialize value of type \`${type}\` from String "${t.value}"`);
  }
  if (t.kind === 'int') {
    const v = values[Number(t.value)];
    if (t.value >= 0n && v !== undefined) return v;
    throw new JacksonError('InvalidFormatException', `Cannot deserialize value of type \`${type}\` from number ${t.text}`);
  }
  throw new JacksonError('MismatchedInputException', `Cannot deserialize value of type \`${type}\` from ${t.kind}`);
}

/** A `String` element: scalars become their text. */
function readString(t: Token): string | null {
  switch (t.kind) {
    case 'string':
      return t.value;
    case 'null':
      return null;
    case 'int':
    case 'float':
      return t.text;
    case 'true':
    case 'false':
      return t.kind;
    default:
      throw new JacksonError('MismatchedInputException', `Cannot deserialize value of type \`java.lang.String\` from ${t.kind}`);
  }
}

function readArray<T>(t: Token, element: (e: Token) => T): T[] {
  if (t.kind !== 'array') {
    throw new JacksonError('MismatchedInputException', `Cannot deserialize value of type \`java.util.Collection\` from ${t.kind}`);
  }
  return t.items.map(element);
}

type IntField = 'minLevel' | 'maxLevel' | 'minFrequency' | 'maxFrequency' | 'upcomingReviewLessThan'
  | 'upcomingReviewMoreThan' | 'incorrectAnswerWithin' | 'burnedLessThan' | 'burnedMoreThan';
const INT_FIELDS: ReadonlySet<string> = new Set<IntField>([
  'minLevel', 'maxLevel', 'minFrequency', 'maxFrequency', 'upcomingReviewLessThan', 'upcomingReviewMoreThan',
  'incorrectAnswerWithin', 'burnedLessThan', 'burnedMoreThan',
]);

/**
 * `objectMapper.readValue(json, AdvancedSearchParameters.class)`. Returns null for the JSON
 * literal `null` (Java then fails with a `NullPointerException` when it uses the result); throws
 * `JacksonError` when Jackson throws.
 */
export function parseParameters(json: string): AdvancedSearchParameters | null {
  const root = new JsonReader(json).readRoot();
  if (root === null) throw new JacksonError('MismatchedInputException', 'No content to map due to end-of-input');
  if (root.kind === 'null') return null;
  if (root.kind !== 'object') {
    throw new JacksonError('MismatchedInputException', `Cannot construct instance of \`AdvancedSearchParameters\` from ${root.kind}`);
  }
  const p = defaultParameters();
  for (const [name, t] of root.entries) {
    if (INT_FIELDS.has(name)) {
      p[name as IntField] = readInteger(t);
    } else if (name === 'leechesOnly') {
      p.leechesOnly = readBoolean(t);
    } else if (name === 'sortOrder') {
      if (t.kind !== 'null') p.sortOrder = readEnum(t, SEARCH_SORT_ORDERS, 'SearchSortOrder');
    } else if (name === 'starRatings' || name === 'jlptLevels' || name === 'joyoGrades') {
      if (t.kind !== 'null') p[name] = readArray(t, readInteger);
    } else if (name === 'srsStages') {
      if (t.kind !== 'null') p.srsStages = readArray(t, readString);
    } else if (name === 'itemTypes') {
      if (t.kind !== 'null') {
        // EnumSet: ordinal order, no duplicates; a null element fails.
        const types = readArray(t, (e) => {
          if (e.kind === 'null') throw new JacksonError('JsonMappingException', 'null in EnumSet');
          return readEnum(e, SUBJECT_TYPES, 'SubjectType');
        });
        p.itemTypes = SUBJECT_TYPES.filter((type) => types.includes(type));
      }
    }
    // Anything else: FAIL_ON_UNKNOWN_PROPERTIES is off.
  }
  return p;
}

const jsonString = (s: string): string => JSON.stringify(s);
const jsonInt = (n: number | null): string => (n === null ? 'null' : String(n));

/**
 * `objectMapper.writeValueAsString(parameters)`: properties in alphabetical order; the sets in Java
 * `HashSet` iteration order, `itemTypes` (an `EnumSet`) in ordinal order.
 */
export function writeParameters(p: AdvancedSearchParameters): string {
  const ints = (xs: readonly (number | null)[]): string =>
    `[${hashSetOrder(xs, (x) => (x === null ? 0 : integerHash(x))).map(jsonInt).join(',')}]`;
  const strings = (xs: readonly (string | null)[]): string =>
    `[${hashSetOrder(xs, (x) => (x === null ? 0 : stringHash(x))).map((x) => (x === null ? 'null' : jsonString(x))).join(',')}]`;
  const types = SUBJECT_TYPES.filter((t) => p.itemTypes.includes(t)).map(jsonString);
  return `{"burnedLessThan":${jsonInt(p.burnedLessThan)},"burnedMoreThan":${jsonInt(p.burnedMoreThan)},`
    + `"incorrectAnswerWithin":${jsonInt(p.incorrectAnswerWithin)},"itemTypes":[${types.join(',')}],`
    + `"jlptLevels":${ints(p.jlptLevels)},"joyoGrades":${ints(p.joyoGrades)},"leechesOnly":${String(p.leechesOnly)},`
    + `"maxFrequency":${jsonInt(p.maxFrequency)},"maxLevel":${jsonInt(p.maxLevel)},`
    + `"minFrequency":${jsonInt(p.minFrequency)},"minLevel":${jsonInt(p.minLevel)},"sortOrder":${jsonString(p.sortOrder)},`
    + `"srsStages":${strings(p.srsStages)},"starRatings":${ints(p.starRatings)},`
    + `"upcomingReviewLessThan":${jsonInt(p.upcomingReviewLessThan)},"upcomingReviewMoreThan":${jsonInt(p.upcomingReviewMoreThan)}}`;
}
