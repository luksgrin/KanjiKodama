/**
 * Rich text as the Android app renders it: `TextUtil.renderHtml` (`HtmlCompat.fromHtml`,
 * `FROM_HTML_MODE_COMPACT`) for the small HTML the logic builds (`<b>`, `<br/>`, escaped text), as plain
 * text plus style spans. A UI renders the spans; tests compare text and ranges.
 *
 * Java: `util/TextUtil.escapeHtml`, `util/TextUtil.renderHtml`.
 */

/** A style span `[type, start, end)` in UTF-16 units of `text`. */
export type RichSpan = [type: 'bold', start: number, end: number];

export interface RichText {
  text: string;
  spans: RichSpan[];
}

/** `TextUtil.escapeHtml`: only `&`, `<` and `>` (quotes are left alone). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntity(name: string): string | null {
  if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16));
  if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
  return ENTITIES[name] ?? null;
}

/**
 * `TextUtil.renderHtml` for the markup this app builds: `<b>`/`</b>` become bold spans, `<br>`/`<br/>` a
 * line break, entities are decoded. Text whitespace follows Android's `Html`: a space, CR or LF is
 * dropped after a space or line break (or at the very start) and otherwise becomes one space; tabs and
 * other spaces (NBSP, U+3000) stay. Other tags are ignored.
 */
export function renderHtml(html: string): RichText {
  let text = '';
  const spans: RichSpan[] = [];
  const open: number[] = [];
  const appendChar = (c: string): void => {
    if (c === ' ' || c === '\n' || c === '\r') {
      const pred = text.length === 0 ? '\n' : text[text.length - 1];
      if (pred !== ' ' && pred !== '\n') text += ' ';
    } else {
      text += c;
    }
  };
  let i = 0;
  while (i < html.length) {
    const c = html[i] as string;
    if (c === '<') {
      const end = html.indexOf('>', i);
      if (end < 0) {
        appendChar(c);
        i++;
        continue;
      }
      const tag = html.slice(i + 1, end).trim().toLowerCase();
      i = end + 1;
      if (tag === 'b' || tag === 'strong') open.push(text.length);
      else if (tag === '/b' || tag === '/strong') {
        const start = open.pop();
        if (start !== undefined && start < text.length) spans.push(['bold', start, text.length]);
      } else if (tag === 'br' || tag === 'br/') text += '\n';
      continue;
    }
    if (c === '&') {
      const semi = html.indexOf(';', i);
      const decoded = semi > i ? decodeEntity(html.slice(i + 1, semi)) : null;
      if (decoded !== null) {
        for (const ch of decoded) appendChar(ch);
        i = semi + 1;
        continue;
      }
    }
    appendChar(c);
    i++;
  }
  spans.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  return { text, spans };
}

/** The bold ranges `[start, end)` of a rich text. */
export function boldRanges(rich: RichText): [number, number][] {
  return rich.spans.filter((s) => s[0] === 'bold').map((s) => [s[1], s[2]]);
}

/** `TextUtils.concat(rich, plain)`: the spans stay where they were. */
export function concatRich(rich: RichText, plain: string): RichText {
  return { text: rich.text + plain, spans: rich.spans };
}
