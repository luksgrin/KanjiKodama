/**
 * Browse / search (`fragments/BrowseOverviewFragment`, layout `fragment_browse_overview.xml`): search
 * presets (Search / Delete), "Choose a level to browse:" (the user's level highlighted; in JLPT order
 * the levels are grouped under their JLPT block, N5 first), "Keyword search:" (characters, meanings,
 * readings; romaji also searched as kana) and "Advanced search:". Each search opens the results
 * screen (`/browse/results`, `SearchResultFragment`).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { currentMaxLevel } from '../../../core/progression';
import { writeParameters } from '../../../core/search';
import { enableStarRatings } from '../../../core/settings/subjectInfo';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Panel';
import { useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { AdvancedSearchFormView, blockRanges } from './AdvancedSearchFormView';
import { presetByName, presetNames, useSearchPresets } from './searchPresets';
import './browse.css';

export function BrowseScreen() {
  const { learner, state } = useReady();
  const navigate = useNavigate();
  const { presets, remove } = useSearchPresets();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const names = presetNames(presets);
  const selection = selected !== null && names.includes(selected) ? selected : (names[0] ?? null);

  const maxLevel = currentMaxLevel(learner);
  const userLevel = learner.progress.userLevel;
  const jlpt = learner.ordering === 'JLPT';
  const blocks = jlpt ? learner.blocks : [];
  const groups = useMemo(() => {
    const levels = Array.from({ length: maxLevel }, (_, i) => i + 1);
    if (!jlpt || blocks.length === 0) return [{ label: null as string | null, levels }];
    return blockRanges(blocks).map((r) => ({ label: r.label as string | null, levels: levels.filter((l) => l >= r.first && l <= r.last) }));
  }, [maxLevel, jlpt, blocks, state.revision]);

  const submitQuery = (e: FormEvent): void => {
    e.preventDefault();
    if (query === '') return;
    navigate(paths.searchResults(1, query));
  };

  const runPreset = (): void => {
    if (selection === null) return;
    const p = presetByName(presets, selection);
    if (p) navigate(paths.searchResults(p.type, p.data, p.name));
  };

  return (
    <div className="kk-browse">
      {toast !== null && <p className="kk-banner ok" role="status">{toast}</p>}
      {names.length > 0 && (
        <Panel title="Search presets:">
          <div className="kk-browse-presets">
            <select aria-label="Search preset" value={selection ?? ''} onChange={(e) => setSelected(e.target.value)}>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" className="kk-btn small" onClick={runPreset}>Search</button>
            <button type="button" className="kk-btn small secondary" onClick={() => selection !== null && setConfirmDelete(selection)}>Delete</button>
          </div>
        </Panel>
      )}

      <Panel title="Choose a level to browse:">
        {groups.map((g) => (
          <div key={g.label ?? 'all'} className="kk-browse-level-group">
            {g.label !== null && <h3 className="kk-browse-block">{g.label}</h3>}
            <div className="kk-browse-levels">
              {g.levels.map((level) => (
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
          </div>
        ))}
      </Panel>

      <Panel title="Keyword search:">
        <form className="kk-browse-query" onSubmit={submitQuery}>
          <input
            type="search"
            aria-label="Query"
            placeholder="Query"
            value={query}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="kk-btn small">Search</button>
        </form>
        <p className="kk-xsmall kk-muted">Characters, meanings or readings; readings can be typed in romaji.</p>
      </Panel>

      <Panel title="Advanced search:">
        <AdvancedSearchFormView
          systems={learner.srsSystems}
          starRatingsEnabled={enableStarRatings(state.prefs)}
          blocks={blocks}
          onSearch={(p) => navigate(paths.searchResults(2, writeParameters(p)))}
        />
      </Panel>

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
          if (name !== null) void remove(name).then(() => setToast('Preset deleted'));
        }}
      >
        <p>Are you sure you want to delete the preset named &apos;{confirmDelete}&apos;?</p>
      </ConfirmDialog>
    </div>
  );
}
