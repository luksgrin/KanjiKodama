/**
 * Level progression (`LevelProgressView`, `level_progress.xml`, `LevelProgressRowView`,
 * `LevelProgressBarView`): on the tile background, the bold "Level progression" heading, one row per
 * level and type with the 24 dp bar left (buckets 0 passed, 1..7 apprentice stages, 8 initiate, 9
 * locked; the level-up target line on the user's level for kanji) and "Lvl 4 kanji" (14 sp) right,
 * then the legend "Passed / Apprentice / Initiate / Locked". A row opens the search for that level and
 * type, sorted by stage (`SearchSortOrder.STAGE_TYPE`).
 */
import type { LevelProgressBar } from '../../../core/dashboard';
import type { SubjectTypeName } from '../../../core/content';
import { defaultParameters, writeParameters } from '../../../core/search';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';

/** `SubjectType.levelProgressLabel`. */
const TYPE_LABEL: Readonly<Record<SubjectTypeName, string>> = {
  WANIKANI_RADICAL: 'radicals',
  WANIKANI_KANJI: 'kanji',
  WANIKANI_VOCAB: 'vocabulary',
  WANIKANI_KANA_VOCAB: 'vocabulary',
};

/** `SubjectType.hasLevelUpTarget`. */
const HAS_TARGET: ReadonlySet<SubjectTypeName> = new Set(['WANIKANI_KANJI']);

export function LevelProgress({ bars, userLevel }: { bars: LevelProgressBar[]; userLevel: number }) {
  const navigate = useNavigate();
  const open = (bar: LevelProgressBar) => {
    const p = defaultParameters();
    p.minLevel = bar.level;
    p.maxLevel = bar.level;
    p.itemTypes = [bar.type];
    p.sortOrder = 'STAGE_TYPE';
    navigate(paths.searchResults(2, writeParameters(p)));
  };
  return (
    <div className="kk-lp" data-testid="level-progress">
      <div className="kk-lp-title">Level progression</div>
      {bars.map((bar) => {
        const total = bar.buckets.reduce((a, b) => a + b, 0);
        const passed = bar.buckets[0] ?? 0;
        const label = `Lvl ${bar.level} ${TYPE_LABEL[bar.type]}`;
        const target = userLevel === bar.level && HAS_TARGET.has(bar.type) && total > 0
          ? Math.trunc((total * 9 + 9) / 10) : null;
        return (
          <button type="button" className="kk-lp-row" key={`${bar.level}-${bar.type}`} data-testid={`level-${bar.level}`}
            onClick={() => open(bar)} aria-label={`${label}: ${passed} of ${total} passed`}>
            <span className="kk-lp-bar" aria-hidden="true">
              {bar.buckets.map((n, i) => (n > 0 ? <span key={i} className={`lp-${i}`} style={{ flexGrow: n }} /> : null))}
              {target !== null && <i className="kk-lp-target" style={{ left: `${(target / total) * 100}%` }} />}
            </span>
            <span className="kk-lp-label">{label}</span>
          </button>
        );
      })}
      <div className="kk-lp-legend" aria-hidden="true">
        <i className="lp-0 first" /><span>Passed</span>
        <i className="lp-1 gap" /><i className="lp-2" /><i className="lp-3" /><i className="lp-4" /><i className="lp-5" /><i className="lp-6" /><i className="lp-7 end" />
        <span>Apprentice</span>
        <i className="lp-8 gap end" /><span>Initiate</span>
        <i className="lp-9 gap end" /><span>Locked</span>
      </div>
    </div>
  );
}
