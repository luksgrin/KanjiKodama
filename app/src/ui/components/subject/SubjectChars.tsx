/**
 * A subject's characters, or the radical's image where it has one ("Yurt", "Beggar"…).
 *
 * On a tile the image fills the square the text would take, tinted in the text colour over two black
 * copies offset by +2 and −1 px; inline in HTML text it is one text-size square, same tint and shadows.
 * The images come from the content file (`content/titleImages.ts`); without one the slug is shown.
 */
import './titleImage.css';
import { useId } from 'react';
import { titleImageOf, type TitleImage } from '../../../content/titleImages';

type SubjectLike = { id: number; object: string; characters: string | null; slug: string | null };

/** The vector drawable as an inline SVG, 1em square, stroked in `currentColor`. */
export function TitleImageSvg({ image, label }: { image: TitleImage; label: string }) {
  const uid = `kkti${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const clips = [...new Set(image.paths.flatMap((p) => (p.clip === undefined ? [] : [p.clip])))];
  return (
    <svg className="kk-title-image" viewBox={`0 0 ${image.size} ${image.size}`} width="1em" height="1em" role="img" aria-label={label}
      data-testid="title-image">
      {clips.length > 0 && (
        <defs>
          {clips.map((d, i) => <clipPath key={i} id={`${uid}c${i}`}><path d={d} /></clipPath>)}
        </defs>
      )}
      <g fill="none" stroke="currentColor" strokeLinecap="square">
        {image.paths.map((p, i) => (
          <path key={i} d={p.d} strokeWidth={p.w} clipPath={p.clip === undefined ? undefined : `url(#${uid}c${clips.indexOf(p.clip)})`} />
        ))}
      </g>
    </svg>
  );
}

/** Whether the subject is shown as an image (`Subject.needsTitleImage`). */
export function hasTitleImage(subject: { id: number; object: string }): boolean {
  return titleImageOf(subject) !== null;
}

/** Glyph count for sizing a tile: an image counts as one character. */
export function subjectGlyphCount(subject: SubjectLike, text?: string | null): number {
  if (hasTitleImage(subject)) return 1;
  return Math.max(1, [...(text ?? subject.characters ?? subject.slug ?? '')].length);
}

/**
 * The characters (or `text`, e.g. a question's inflected characters) — or the image. The image wins
 * over any text.
 */
export function SubjectChars({ subject, text }: { subject: SubjectLike; text?: string | null }) {
  const image = titleImageOf(subject);
  if (image !== null) return <TitleImageSvg image={image} label={subject.slug ?? String(subject.id)} />;
  return <>{text ?? subject.characters ?? subject.slug ?? ''}</>;
}

const INFO_TITLE_LABELS: Readonly<Record<string, string>> = {
  radical: 'radical',
  kanji: 'kanji',
  vocabulary: 'vocabulary',
  kana_vocabulary: 'Kana-only Vocab',
};

/** `Subject.getInfoTitle(prefix, suffix)` as a node: "力 (level 3 kanji)", with the image inline when there is one. */
export function InfoTitle({ subject, level, prefix = '', suffix = '' }: { subject: SubjectLike; level: number; prefix?: string; suffix?: string }) {
  return (
    <>
      {prefix}
      <SubjectChars subject={subject} />
      {` (level ${level} ${INFO_TITLE_LABELS[subject.object] ?? subject.object})${suffix}`}
    </>
  );
}
