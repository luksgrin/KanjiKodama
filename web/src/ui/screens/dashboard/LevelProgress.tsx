/**
 * Level progress bars (`LevelProgressView`): per level and type, the subjects by bucket (0 passed,
 * 1..7 apprentice stages, 8 initiate, 9 locked), with the level-up target (90 % of the kanji) on the
 * user's level. In JLPT order each level shows its block ("N4, level 2 of 5").
 */
import type { LevelProgressGroup } from '../../../app/dashboardData';
import type { SubjectTypeName } from '../../../core/content';

/** `SubjectType.levelProgressLabel`. */
const TYPE_LABEL: Readonly<Record<SubjectTypeName, string>> = {
  WANIKANI_RADICAL: 'radicals',
  WANIKANI_KANJI: 'kanji',
  WANIKANI_VOCAB: 'vocabulary',
  WANIKANI_KANA_VOCAB: 'vocabulary',
};

/** `LocalProgression`: level-up at ceil(0.9 x kanji) passed. */
const LEVEL_UP_SHARE = 0.9;

export function LevelProgress({ groups, targetLevel }: { groups: LevelProgressGroup[]; targetLevel: number }) {
  if (groups.length === 0) return <p className="kk-muted kk-small">Everything up to your level is passed.</p>;
  return (
    <div className="kk-levels">
      {groups.map((g) => (
        <div className="kk-level" key={g.level} data-testid={`level-${g.level}`}>
          <h3 className="kk-level-title">
            Level {g.level}
            {g.block !== null && <span className="kk-level-block">{g.block}</span>}
          </h3>
          {g.bars.map((bar) => {
            const total = bar.buckets.reduce((a, b) => a + b, 0);
            const passed = bar.buckets[0] ?? 0;
            const showTarget = g.level === targetLevel && bar.type === 'WANIKANI_KANJI' && total > 0;
            const target = Math.ceil(total * LEVEL_UP_SHARE);
            return (
              <div className="kk-lp-row" key={bar.type}>
                <span className="kk-lp-label">Lvl {bar.level} {TYPE_LABEL[bar.type]}</span>
                <div className="kk-lp-bar" role="img" aria-label={`Level ${bar.level} ${TYPE_LABEL[bar.type]}: ${passed} of ${total} passed`}>
                  {bar.buckets.map((n, i) => (n > 0 ? <span key={i} className={`lp-${i}`} style={{ flexGrow: n }} /> : null))}
                  {showTarget && <i className="kk-lp-target" style={{ left: `${(target / total) * 100}%` }} title={`Level-up at ${target}`} />}
                </div>
                <span className="kk-lp-count">{passed}/{total}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
