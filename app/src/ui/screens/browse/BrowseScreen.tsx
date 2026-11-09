/**
 * Browse / search, top to bottom:
 * the tutorial banner (yellow, DISMISS; `browse_overview_dismissed`), "Search presets:" with the preset
 * choice and Search / Delete (only when presets exist), "Choose a level to browse:" with the level
 * table (`render`: round(width / 40 dp) columns, at most 10, 6..9 become 5; mint cells, the user's
 * level in the highlight colour), "Search by parts:" (opens the radical picker), "Keyword search:"
 * (Query + Search) and "Advanced search:" (the form).
 * Toolbar title "Browse / search".
 */
import { useEffect, useState, type FormEvent } from 'react';
import type { LearnerDb } from '../../../core/progression';
import { writeParameters } from '../../../core/search';
import { prefBoolean } from '../../../core/settings';
import { enableStarRatings } from '../../../core/settings/subjectInfo';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { toast } from '../../shell/toast';
import { useToolbar } from '../../shell/toolbar';
import { AdvancedSearchFormView } from './AdvancedSearchFormView';
import { presetByName, presetNames, useSearchPresets } from './searchPresets';
import './browse.css';

/** The level table's column width. */
const COLUMN_WIDTH = 40;

export const BROWSE_TUTORIAL = 'From this screen you can search the subject database by level, by keyword, or by'
  + ' advanced filter criteria. From the search result screen you can then save search presets, start a self-study quiz,'
  + ' and more. Once you have defined search presets, they will be shown here as well.';

/** The level table's column count for a screen width in px. */
export function levelColumns(dpWidth: number): number {
  let n = Math.round(dpWidth / COLUMN_WIDTH);
  if (n < 1) n = 1;
  if (n > 10) n = 10;
  if (n < 10 && n > 5) n = 5;
  return n;
}

/** The highest level of a visible subject (60 when there is none). */
export function browseMaxLevel(learner: LearnerDb): number {
  let max = 0;
  for (const s of learner.content.subjects) {
    const t = learner.table.get(s.id);
    if ((t?.hiddenAt ?? s.hiddenAt) !== 0) continue;
    max = Math.max(max, t?.level ?? s.level);
  }
  return max === 0 ? 60 : max;
}

function useWindowWidth(): number {
  const read = () => (typeof document === 'undefined' ? 411 : document.documentElement.clientWidth || window.innerWidth);
  const [w, setW] = useState(read);
  useEffect(() => {
    // The Android WebView can report a wrong width for a moment while the keyboard closes and then
    // not send another resize event: follow the root element's layout size instead.
    const on = () => setW(read());
    on();
    window.addEventListener('resize', on);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(on);
    ro?.observe(document.documentElement);
    return () => { window.removeEventListener('resize', on); ro?.disconnect(); };
  }, []);
  return w;
}

export function BrowseScreen() {
  const app = useApp();
  const { learner, state } = useReady();
  const navigate = useNavigate();
  const { presets, remove } = useSearchPresets();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const width = useWindowWidth();
  useToolbar({ title: 'Browse / search' });

  const names = presetNames(presets);
  const selection = selected !== null && names.includes(selected) ? selected : (names[0] ?? null);
  const maxLevel = browseMaxLevel(learner);
  const userLevel = learner.progress.userLevel;
  const columns = levelColumns(width);
  const tutorial = !prefBoolean(state.prefs, 'browse_overview_dismissed', false);

  const submitQuery = (e: FormEvent): void => {
    e.preventDefault();
    if (query === '') return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    navigate(paths.searchResults(1, query));
  };

  const runPreset = (): void => {
    if (selection === null) return;
    const p = presetByName(presets, selection);
    if (p) navigate(paths.searchResults(p.type, p.data, p.name));
  };

  return (
    <div className="kk-browse">
      {tutorial && (
        <div className="kk-tip" data-testid="browse-tutorial">
          <p className="kk-tip-text">{BROWSE_TUTORIAL}</p>
          <div className="kk-tip-actions">
            <button type="button" className="kk-tip-btn" onClick={() => void app.setPreference('browse_overview_dismissed', true)}>Dismiss</button>
          </div>
        </div>
      )}

      {names.length > 0 && (
        <>
          <h2 className="kk-browse-heading presets">Search presets:</h2>
          <select className="kk-browse-preset-select" aria-label="Search preset" value={selection ?? ''} onChange={(e) => setSelected(e.target.value)}>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="kk-browse-presets">
            <button type="button" className="kk-btn" onClick={runPreset}>Search</button>
            <button type="button" className="kk-btn" onClick={() => selection !== null && setConfirmDelete(selection)}>Delete</button>
          </div>
          <hr className="kk-browse-divider" />
        </>
      )}

      <h2 className="kk-browse-heading">Choose a level to browse:</h2>
      <div className="kk-browse-levels" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} data-testid="browse-levels">
        {Array.from({ length: maxLevel }, (_, i) => i + 1).map((level) => (
          <button
            key={level}
            type="button"
            className={`kk-browse-level${level === userLevel ? ' current' : ''}`}
            aria-current={level === userLevel ? 'true' : undefined}
            data-testid={`browse-level-${level}`}
            onClick={() => navigate(paths.searchResults(0, String(level)))}
          >
            {level}
          </button>
        ))}
      </div>
      <hr className="kk-browse-divider" />

      <h2 className="kk-browse-heading">Search by parts:</h2>
      <div className="kk-browse-parts">
        <p className="kk-browse-parts-text">Find a kanji by the parts you see in it.</p>
        <button type="button" className="kk-btn" data-testid="browse-parts" onClick={() => navigate(paths.partsSearch())}>Pick parts</button>
      </div>
      <hr className="kk-browse-divider" />

      <h2 className="kk-browse-heading">Keyword search:</h2>
      <form className="kk-browse-query" onSubmit={submitQuery}>
        <input
          type="text"
          aria-label="Query"
          placeholder="Query"
          value={query}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="kk-btn">Search</button>
      </form>
      <hr className="kk-browse-divider" />

      <h2 className="kk-browse-heading">Advanced search:</h2>
      <AdvancedSearchFormView
        systems={learner.srsSystems}
        starRatingsEnabled={enableStarRatings(state.prefs)}
        onSearch={(p) => navigate(paths.searchResults(2, writeParameters(p)))}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete preset?"
        confirmLabel="Yes"
        cancelLabel="No"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const name = confirmDelete;
          setConfirmDelete(null);
          if (name !== null) void remove(name).then(() => toast('Preset deleted'));
        }}
      >
        <p>Are you sure you want to delete the preset named &apos;{confirmDelete}&apos;?</p>
      </ConfirmDialog>
    </div>
  );
}
