import { QUESTION_KIND_GLYPH, QUESTION_KIND_LABEL, type QuestionKind } from '../../../core/answer';
import './readingKindBadge.css';

export interface ReadingKindBadgeProps {
  /** What the question asks for (`questionKind`). */
  kind: QuestionKind;
  /**
   * Show the label ("On'yomi") next to the glyph (default). Without it the badge is the glyph alone
   * and hidden from screen readers: the question banner says the same in words.
   */
  showLabel?: boolean;
}

/**
 * The pixel badge saying what a quiz question asks for: 意 meaning, 音 on'yomi, 訓 kun'yomi, 音訓 either,
 * 読 a reading. Drawn in the surrounding text colour (a glyph tile with a stepped pixel frame), so it
 * reads on the meaning and the reading banner in every theme and never relies on colour alone.
 */
export function ReadingKindBadge({ kind, showLabel = true }: ReadingKindBadgeProps) {
  const label = QUESTION_KIND_LABEL[kind];
  return (
    <span className={`kk-kind-badge kk-kind-badge--${kind}`} data-testid="reading-kind-badge" data-kind={kind}
      aria-hidden={showLabel ? undefined : true}>
      <span className="kk-kind-badge-glyph" lang="ja" aria-hidden="true">{QUESTION_KIND_GLYPH[kind]}</span>
      {showLabel && <span className="kk-kind-badge-label">{label}</span>}
    </span>
  );
}
