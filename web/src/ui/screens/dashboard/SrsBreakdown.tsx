/**
 * SRS breakdown (`SrsBreakDownView`, `srs_breakdown.xml`): five 84 dp tiles, three on the first row and
 * two on the second, stage name (13 sp) top-left, count (34 sp, shadowed) centred. A tap opens the
 * search for that stage group (`goToSearchResult(2, …)`).
 */
import { defaultParameters, writeParameters } from '../../../core/search';
import { fallbackSrsSystems, type SrsSystem } from '../../../core/srs';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';

const NAMES = ['Apprentice', 'Guru', 'Master', 'Enlightened', 'Burned'] as const;
const CLASSES = ['apprentice', 'guru', 'master', 'enlightened', 'burned'] as const;

/** The `srsStages` tags each tile searches for. */
export function srsBreakdownTags(index: number, given: readonly SrsSystem[]): string[] {
  // SrsSystemRepository.getSystems: the built-in systems when the database has none.
  const systems = given.length > 0 ? given : fallbackSrsSystems();
  if (index === 0) {
    const n = Math.max(0, ...systems.map((s) => s.numPrePassedStages));
    return Array.from({ length: n }, (_, i) => `prepass:${i}`);
  }
  if (index === 1) {
    const n = Math.max(0, ...systems.map((s) => s.numPassedStages - 2));
    return Array.from({ length: n }, (_, i) => `pass:${i}`);
  }
  return [['master', 'enlightened', 'burned'][index - 2]!];
}

export function SrsBreakdown({ counts, systems }: { counts: number[]; systems: readonly SrsSystem[] }) {
  const navigate = useNavigate();
  const open = (i: number) => {
    const p = defaultParameters();
    p.srsStages = srsBreakdownTags(i, systems);
    navigate(paths.searchResults(2, writeParameters(p)));
  };
  return (
    <div className="kk-dash-panel kk-srs" data-testid="srs-breakdown">
      {NAMES.map((name, i) => (
        <button key={name} type="button" className={`kk-srs-tile ${CLASSES[i]}`} onClick={() => open(i)}
          aria-label={`${name}: ${counts[i] ?? 0}`}>
          <span className="kk-srs-name">{name}</span>
          <span className="kk-srs-count" data-testid={`srs-${CLASSES[i]}`}>{counts[i] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
