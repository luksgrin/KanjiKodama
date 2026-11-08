/**
 * Renders WaniKani markup (mnemonics, hints, the info lines the app builds as HTML) as React
 * elements from the parsed tree: never `dangerouslySetInnerHTML`. Subject tags are coloured chips
 * when `highlight` is on (the `highlight_subject_tags` setting,
 * default on), bold otherwise; `<ja>` text gets `lang="ja"` and the Japanese font.
 */
import './subject.css';
import { Fragment, useMemo, type ReactNode } from 'react';
import { parseWkMarkup, type MarkupNode } from '../../../core/text/wkMarkup';

/** Only web links are clickable (the content has a few YouTube links); others render as text. */
export function safeHref(href: string | null | undefined): string | null {
  if (href === null || href === undefined) return null;
  return /^https?:\/\//i.test(href.trim()) ? href.trim() : null;
}

function renderText(text: string, key: string): ReactNode {
  if (!text.includes('\n')) return text;
  const lines = text.split('\n');
  return (
    <Fragment key={key}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </Fragment>
  );
}

export function renderMarkupNodes(nodes: readonly MarkupNode[], highlight: boolean, keyPrefix = ''): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}${i}`;
    if (typeof node === 'string') return renderText(node, key);
    const kids = renderMarkupNodes(node.children, highlight, `${key}.`);
    switch (node.tag) {
      case 'radical':
      case 'kanji':
      case 'vocabulary':
      case 'kana_vocabulary':
      case 'reading':
        return highlight ? (
          <span key={key} className={`kk-wk-tag kk-wk-tag--${node.tag}`}>
            {kids}
          </span>
        ) : (
          <b key={key}>{kids}</b>
        );
      case 'ja':
        return (
          <span key={key} lang="ja" className="kk-ja">
            {kids}
          </span>
        );
      case 'b':
        return <b key={key}>{kids}</b>;
      case 'i':
        return <i key={key}>{kids}</i>;
      case 'u':
        return <u key={key}>{kids}</u>;
      case 'small':
        return <small key={key}>{kids}</small>;
      case 'big':
        return (
          <span key={key} className="kk-big">
            {kids}
          </span>
        );
      case 'sup':
        return <sup key={key}>{kids}</sup>;
      case 'sub':
        return <sub key={key}>{kids}</sub>;
      case 's':
        return <s key={key}>{kids}</s>;
      case 'tt':
        return (
          <span key={key} className="kk-tt">
            {kids}
          </span>
        );
      case 'a': {
        const href = safeHref(node.href);
        return href === null ? (
          <span key={key}>{kids}</span>
        ) : (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {kids}
          </a>
        );
      }
      default:
        return <Fragment key={key}>{kids}</Fragment>;
    }
  });
}

export interface WkMarkupProps {
  /** The markup (WaniKani content or a line the app builds as HTML). */
  html: string;
  /** Colored subject tags (`highlight_subject_tags`, default true); bold when false. */
  highlight?: boolean;
  /** Element to render (default `span`). */
  as?: 'span' | 'div' | 'p';
  className?: string;
}

/** WaniKani markup as React elements. */
export function WkMarkup({ html, highlight = true, as: Tag = 'span', className }: WkMarkupProps) {
  const nodes = useMemo(() => parseWkMarkup(html), [html]);
  return <Tag className={className}>{renderMarkupNodes(nodes, highlight)}</Tag>;
}
