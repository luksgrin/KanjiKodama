/**
 * WaniKani's mnemonic markup as the Android app renders it: `TextUtil.renderHtml` is
 * `HtmlCompat.fromHtml(source, FROM_HTML_MODE_COMPACT, null, new WaniKaniTagHandler())`, i.e. Android's
 * `Html` (TagSoup parser) plus the tag handler for `<radical>`/`<rd>`, `<kanji>`/`<kan>`,
 * `<vocabulary>`/`<voc>`, `<kana_vocabulary>`/`<kanavoc>`, `<reading>` and `<ja>`.
 *
 * Parsed into a small, safe tree (plain strings and known tags only, never raw HTML) that a UI maps to
 * elements. What is ported:
 * - Text whitespace as Android's `Html` collapses it: a space, CR or LF is dropped after a space or a
 *   line break (or at the very start) and otherwise becomes one space; tabs, NBSP, U+3000 stay.
 * - `<br>` is a line break (`"\n"`); `<p>`/`<div>`/`<blockquote>`/`<li>`/`<h1-6>` start and end on a new
 *   line (compact mode: one line break, never doubled).
 * - Entities (named and numeric), comments, `<!…>`/`<?…>` declarations; a `<` that doesn't start a tag
 *   is text.
 * - TagSoup's repair: an end tag closes the elements opened after its start tag; an end tag without an
 *   open element is ignored; elements still open at the end are closed there (so
 *   `<reading>car</kanji> (か).` marks "car (か)." as the reading, as on the device). Unknown tags keep
 *   their text (`<span>`, `<font>` …). TagSoup's restarting of formatting elements across a misnested
 *   end tag (`<b>a<i>b</b>c</i>`) is not ported: `c` is plain here.
 * - `<a href>` keeps its href (the UI decides what is clickable); `<title-image-N>` (only in the Java
 *   app's own titles, never in content) is ignored.
 *
 * Java: `util/TextUtil.renderHtml`, `components/WaniKaniTagHandler`, Android `Html.fromHtml`.
 */

/** The WaniKani subject tags (canonical names; `rd`, `kan`, `voc`, `kanavoc` map to these). */
export type WkSubjectTag = 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary' | 'reading';

/** The tags the tree keeps. */
export type MarkupTag =
  | WkSubjectTag
  | 'ja'
  | 'b'
  | 'i'
  | 'u'
  | 'small'
  | 'big'
  | 'sup'
  | 'sub'
  | 's'
  | 'tt'
  | 'a';

export interface MarkupElement {
  tag: MarkupTag;
  /** `<a>` only: the href attribute as written (null when absent). */
  href?: string | null;
  children: MarkupNode[];
}

/** A text run (may contain `"\n"` line breaks) or an element. */
export type MarkupNode = string | MarkupElement;

const TAG_ALIASES: Readonly<Record<string, MarkupTag>> = {
  radical: 'radical',
  rd: 'radical',
  kanji: 'kanji',
  kan: 'kanji',
  vocabulary: 'vocabulary',
  voc: 'vocabulary',
  kana_vocabulary: 'kana_vocabulary',
  kanavoc: 'kana_vocabulary',
  reading: 'reading',
  ja: 'ja',
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  cite: 'i',
  dfn: 'i',
  u: 'u',
  small: 'small',
  big: 'big',
  sup: 'sup',
  sub: 'sub',
  s: 's',
  strike: 's',
  del: 's',
  tt: 'tt',
  a: 'a',
};

const BLOCK_TAGS = new Set(['p', 'div', 'blockquote', 'li', 'ul', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const VOID_TAGS = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'wbr']);

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', times: '×', copy: '©', reg: '®', deg: '°',
  laquo: '«', raquo: '»', bull: '•', trade: '™', eacute: 'é', egrave: 'è', ouml: 'ö', uuml: 'ü', auml: 'ä',
};

function decodeEntity(name: string): string | null {
  if (/^#[xX][0-9a-fA-F]+$/.test(name)) return safeCodePoint(parseInt(name.slice(2), 16));
  if (/^#[0-9]+$/.test(name)) return safeCodePoint(parseInt(name.slice(1), 10));
  return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? null;
}

function safeCodePoint(cp: number): string | null {
  return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : null;
}

/** `name="v"`, `name='v'`, `name=v` or a bare `name`. */
function parseAttributes(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const m of text.matchAll(re)) {
    const name = (m[1] as string).toLowerCase();
    if (!out.has(name)) out.set(name, decodeText(m[2] ?? m[3] ?? m[4] ?? ''));
  }
  return out;
}

/** Entities in an attribute value. */
function decodeText(s: string): string {
  return s.replace(/&(#?[a-zA-Z0-9]+);/g, (all, name: string) => decodeEntity(name) ?? all);
}

interface Open {
  /** The tag name as written, lower-cased (to match end tags). */
  name: string;
  /** Null for a tag the tree doesn't keep (its children go to the parent). */
  element: MarkupElement | null;
  children: MarkupNode[];
}

/** Parses WaniKani/Android HTML into a tree. Never throws. */
export function parseWkMarkup(html: string): MarkupNode[] {
  const root: Open = { name: '#root', element: null, children: [] };
  const stack: Open[] = [root];
  /** The last char output so far ('' at the start). */
  let last = '';

  const top = (): Open => stack[stack.length - 1] as Open;
  const pushText = (s: string): void => {
    if (s === '') return;
    const kids = top().children;
    const prev = kids[kids.length - 1];
    if (typeof prev === 'string') kids[kids.length - 1] = prev + s;
    else kids.push(s);
    last = s[s.length - 1] as string;
  };
  const appendChar = (c: string): void => {
    if (c === ' ' || c === '\n' || c === '\r') {
      if (last !== '' && last !== ' ' && last !== '\n') pushText(' ');
    } else {
      pushText(c);
    }
  };
  const newline = (): void => {
    if (last !== '' && last !== '\n') pushText('\n');
  };
  const close = (): void => {
    const o = stack.pop() as Open;
    const parent = top().children;
    if (o.element === null) {
      for (const k of o.children) {
        if (typeof k === 'string' && typeof parent[parent.length - 1] === 'string') parent[parent.length - 1] += k;
        else parent.push(k);
      }
    } else if (o.children.length > 0) {
      // Android only makes a span when it covers text.
      o.element.children = o.children;
      parent.push(o.element);
    }
    if (BLOCK_TAGS.has(o.name)) newline();
  };

  let i = 0;
  const n = html.length;
  while (i < n) {
    const c = html[i] as string;
    if (c === '<') {
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end < 0 ? n : end + 3;
        continue;
      }
      const next = html[i + 1] ?? '';
      if (next === '!' || next === '?') {
        const end = html.indexOf('>', i);
        i = end < 0 ? n : end + 1;
        continue;
      }
      const isEnd = next === '/';
      const nameStart = isEnd ? i + 2 : i + 1;
      const m = /^[A-Za-z][A-Za-z0-9_:-]*/.exec(html.slice(nameStart, nameStart + 64));
      const end = m === null ? -1 : html.indexOf('>', nameStart);
      if (m === null || end < 0) {
        appendChar(c);
        i++;
        continue;
      }
      const name = m[0].toLowerCase();
      const rest = html.slice(nameStart + m[0].length, end);
      i = end + 1;
      if (isEnd) {
        let k = stack.length - 1;
        while (k > 0 && (stack[k] as Open).name !== name) k--;
        if (k > 0) while (stack.length > k) close();
        else if (name === 'p' || name === 'div') newline();
        continue;
      }
      if (name === 'br') {
        pushText('\n');
        continue;
      }
      if (BLOCK_TAGS.has(name)) {
        if (name === 'p') {
          // A new paragraph closes an open one.
          let k = stack.length - 1;
          while (k > 0 && (stack[k] as Open).name !== 'p') k--;
          if (k > 0) while (stack.length > k) close();
        }
        newline();
      }
      if (VOID_TAGS.has(name)) continue;
      const selfClosing = /\/\s*$/.test(rest);
      const tag = TAG_ALIASES[name];
      let element: MarkupElement | null = null;
      if (tag !== undefined) {
        element = { tag, children: [] };
        if (tag === 'a') element.href = parseAttributes(rest).get('href') ?? null;
      }
      if (selfClosing) {
        if (BLOCK_TAGS.has(name)) newline();
        continue;
      }
      stack.push({ name, element, children: [] });
      continue;
    }
    if (c === '&') {
      const m = /^&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});?/.exec(html.slice(i, i + 40));
      const decoded = m === null ? null : decodeEntity(m[1] as string);
      if (m !== null && decoded !== null) {
        for (const ch of decoded) appendChar(ch);
        i += m[0].length;
        continue;
      }
    }
    appendChar(c);
    i++;
  }
  while (stack.length > 1) close();
  return root.children;
}

/** The plain text of a tree (line breaks as `"\n"`). */
export function markupText(nodes: readonly MarkupNode[]): string {
  return nodes.map((n) => (typeof n === 'string' ? n : markupText(n.children))).join('');
}

/** The text runs under each tag, in document order: `[[tag, text], …]` (outermost first). For tests. */
export function markupTagged(nodes: readonly MarkupNode[]): [MarkupTag, string][] {
  const out: [MarkupTag, string][] = [];
  const walk = (list: readonly MarkupNode[]): void => {
    for (const n of list) {
      if (typeof n === 'string') continue;
      out.push([n.tag, markupText(n.children)]);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
