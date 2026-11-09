/**
 * Stand-ins for two components being built elsewhere; each is used only by the getting-started guide.
 * Swap them in once those land:
 *
 * - `ReadingBadge` → `ReadingKindBadge` from `../../components/session/ReadingKindBadge`
 *   (same `kind` prop): replace this function's body with `<ReadingKindBadge kind={kind} />`, or
 *   import it under this name.
 * - `AppearanceStep` → `AppearancePicker` from `../../components/settings/AppearancePicker`
 *   (no props; reads and writes the font and text size settings itself).
 */

export type ReadingKind = 'meaning' | 'onyomi' | 'kunyomi' | 'both' | 'reading';

const BADGE_TEXT: Readonly<Record<ReadingKind, string>> = {
  meaning: 'Meaning',
  onyomi: '音',
  kunyomi: '訓',
  both: '音訓',
  reading: 'Reading',
};

// TODO: replace with ReadingKindBadge (components/session/ReadingKindBadge).
export function ReadingBadge({ kind }: { kind: ReadingKind }) {
  return <span className="kk-ob-badge" data-kind={kind}>{BADGE_TEXT[kind]}</span>;
}

// TODO: replace with <AppearancePicker /> (components/settings/AppearancePicker).
export function AppearanceStep() {
  return (
    <p className="kk-small kk-muted" data-testid="onboarding-appearance-placeholder">
      The font and text size picker comes here. Until then: Settings, Display settings and Font selection.
    </p>
  );
}
