/**
 * Search results (`fragments/SearchResultFragment`, `fragment_search_result.xml`, with
 * `adapter/search/SearchResultAdapter`): the tutorial banner (`search_result_dismissed`),
 * "<description>: n subject(s) found" (Large), the hits under collapsible headers in the search's sort
 * order (`resultView`; `search_result_top_header` / `_sub_header`: chevron, XLarge title, counts at the
 * right), the cards in a grid of (width + 10) / 90 columns, vocabulary as full rows (`SubjectCardBinder`).
 * The "Search result..." menu in the toolbar overflow (`res/menu/generic_options_menu.xml`): Refine search
 * (not for keyword searches; the form opens above the list), Save preset, Start self-study quiz (when
 * there are hits; a running session just opens), Resurrect burned items / Burn resurrected items
 * (local mode), Set to ☆ … ★ (with `enable_star_ratings`). Title: the preset name or "Search results".
 *
 * Route `/browse/results?t=<0|1|2>&q=<level|query|parameters JSON>[&preset=<name>]`.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SubjectTypeName } from '../../../core/content';
import { toKatakana } from '../../../core/kana';
import { isBurnable, isResurrectable, num, progressRow } from '../../../core/progression';
import { oneMeaning, writeParameters, type SearchSubject } from '../../../core/search';
import { prefBoolean } from '../../../core/settings';
import { enableStarRatings, showOnInKatakana } from '../../../core/settings/subjectInfo';
import type { SrsSystem } from '../../../core/srs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { formatTimestamp, starsText, useStarRatings } from '../../components/subject';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate, useRoute } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { toast } from '../../shell/toast';
import { useToolbar, type ToolbarAction } from '../../shell/toolbar';
import { BurnResurrectDialog, runBurnResurrect, type BurnResurrectKind } from '../subject/BurnResurrectDialog';
import { AdvancedSearchFormView } from './AdvancedSearchFormView';
import {
  buildSearchSubjects,
  cardProgressText,
  cardStage,
  headerDetails,
  readSearchTexts,
  resultView,
  runSearch,
  searchDescription,
  type SearchType,
} from './searchData';
import { useSearchPresets } from './searchPresets';
import { SubjectCard } from './SubjectCard';
import { sessionPath, sessionRuntime, useActiveSession } from '../../components/session';
import './browse.css';

/** `SubjectType` description / plural (`ItemTypeHeaderItemViewHolder`). */
const TYPE_TEXT: Readonly<Record<SubjectTypeName, [string, string]>> = {
  WANIKANI_RADICAL: ['Radical', 'Radicals'],
  WANIKANI_KANJI: ['Kanji', 'Kanji'],
  WANIKANI_VOCAB: ['Vocabulary', 'Vocabulary'],
  WANIKANI_KANA_VOCAB: ['Kana-only Vocabulary', 'Vocabulary'],
};

interface Group {
  key: string;
  title: string;
  top: boolean;
  subjects: SearchSubject[];
  children: Group[];
}

function stageName(tag: string, systems: readonly SrsSystem[]): string {
  if (tag === 'locked') return 'Locked';
  for (const sys of systems) for (const st of sys.stages) if (st.advancedSearchTag === tag) return st.name;
  return tag;
}

/** The header title of a `resultView` header label (`*HeaderItemViewHolder.bind`). */
function headerTitle(label: string, count: number, systems: readonly SrsSystem[], searchTime: number): string {
  const colon = label.indexOf(':');
  const cls = label.slice(0, colon);
  const tag = label.slice(colon + 1);
  if (cls === 'ItemTypeHeaderItem') {
    const type = (tag.split(' ').pop() ?? tag) as SubjectTypeName;
    const [one, many] = TYPE_TEXT[type] ?? [type, type];
    return count === 1 ? `1 ${one}` : `${count} ${many}`;
  }
  if (cls === 'LevelHeaderItem') return `Level ${tag}`;
  if (cls === 'SrsStageHeaderItem') return stageName(tag, systems);
  const ts = Number(tag);
  if (ts === 0) return 'No review scheduled';
  if (ts <= searchTime) return 'Review available now';
  return formatTimestamp(ts);
}

/** `Subject.getOneReading`, with on'yomi in katakana when `show_onyomi_in_katakana` is on. */
function oneReading(s: SearchSubject, katakana: boolean): string {
  if (s.readings.length === 0) return '';
  let t = s.readings[0]!;
  for (let i = 1; i < s.readings.length; i++) {
    const u = s.readings[i]!;
    if (t.primary) continue;
    if (u.primary) {
      t = u;
      continue;
    }
    if (t.accepted_answer) continue;
    t = u;
  }
  const r = t.reading ?? '';
  return katakana && t.type === 'onyomi' ? toKatakana(r) : r;
}

/** `SearchResultFragment`: columns of the result grid for a screen width in dp. */
export function resultSpans(dpWidth: number): number {
  return Math.max(1, Math.trunc((dpWidth + 10) / 90));
}

export const RESULTS_TUTORIAL = 'This screen shows the results from the search you chose before.'
  + ' You can click on the various headers in the list to collapse/expand groups'
  + ' of subjects.\n'
  + 'Other actions such as refining your search, saving a preset or '
  + 'starting a self-study session can be accessed from the menu.';

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

export function SearchResultsScreen() {
  const app = useApp();
  const { learner, content, state } = useReady();
  const { query } = useRoute();
  const navigate = useNavigate();
  const stars = useStarRatings();
  const { save } = useSearchPresets();
  const activeSession = useActiveSession();
  const [starting, setStarting] = useState(false);
  const width = useWindowWidth();

  const rawType = Number(query.get('t') ?? '0');
  const type: SearchType = rawType === 1 || rawType === 2 ? rawType : 0;
  const data = query.get('q') ?? '1';
  const presetName = query.get('preset');

  const [searchTime] = useState(() => app.clock.now());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [refining, setRefining] = useState(false);
  const [presetDialog, setPresetDialog] = useState<string | null>(null);
  const [starsDialog, setStarsDialog] = useState<number | null>(null);
  const [burnDialog, setBurnDialog] = useState<BurnResurrectKind | null>(null);

  const starsOn = enableStarRatings(state.prefs);
  const katakana = showOnInKatakana(state.prefs);
  const systems = learner.srsSystems;
  const texts = useMemo(() => readSearchTexts(content.db), [content.db]);
  const subjects = useMemo(() => buildSearchSubjects(learner, texts, stars.ratings), [learner, texts, stars.ratings, state.revision]);
  const run = useMemo(
    () => runSearch(subjects, type, data, { systems, starRatingsEnabled: starsOn, now: searchTime }),
    [subjects, type, data, systems, starsOn, searchTime],
  );
  const shown = run.subjects;
  const singleLevel = run.sortOrder === 'TYPE';
  const groups = useMemo(() => {
    const view = resultView(shown, run.sortOrder, searchTime, systems);
    const root: Group[] = [];
    let top: Group | null = null;
    let current: Group | null = null;
    for (const item of view) {
      if ('header' in item) {
        const g: Group = { key: item.header, title: item.header, top: !item.header.startsWith('ItemTypeHeaderItem:'), subjects: [], children: [] };
        if (g.top) {
          top = g;
          root.push(g);
        } else {
          (top ? top.children : root).push(g);
          current = g;
        }
      } else if (current) {
        current.subjects.push(item.subject);
      }
    }
    return root;
  }, [shown, run.sortOrder, searchTime, systems]);

  const local = state.mode !== 'server';
  const resurrectable = useMemo(() => (local ? shown.filter((s) => isResurrectable(learner, s.id)) : []), [shown, learner, local, state.revision]);
  const burnable = useMemo(() => (local ? shown.filter((s) => isBurnable(learner, s.id)) : []), [shown, learner, local, state.revision]);
  const passedAt = (id: number): number => num(progressRow(learner, id), 'passedAt');

  /** `action_search_result_self_study`: the hits become a self-study session; a running session just opens. */
  const startSelfStudy = async (): Promise<void> => {
    if (starting) return;
    if (activeSession.active) {
      navigate(sessionPath(activeSession.type));
      return;
    }
    setStarting(true);
    try {
      const ok = shown.length > 0 && await sessionRuntime(app).start('SELF_STUDY', shown.map((s) => s.id));
      if (ok) navigate(paths.selfStudyQuiz());
    } finally {
      setStarting(false);
    }
  };

  const actions: ToolbarAction[] = [];
  if (type !== 1) actions.push({ id: 'search_result_refine', label: 'Refine search', onSelect: () => setRefining((r) => !r) });
  actions.push({ id: 'search_result_save_preset', label: 'Save preset', onSelect: () => setPresetDialog(presetName ?? '') });
  if (shown.length > 0) {
    actions.push({ id: 'search_result_self_study', label: 'Start self-study quiz', disabled: starting, onSelect: () => void startSelfStudy() });
  }
  if (resurrectable.length > 0) actions.push({ id: 'search_result_resurrect', label: 'Resurrect burned items', onSelect: () => setBurnDialog('resurrect') });
  if (burnable.length > 0) actions.push({ id: 'search_result_burn', label: 'Burn resurrected items', onSelect: () => setBurnDialog('burn') });
  if (starsOn) {
    for (let n = 0; n <= 5; n++) actions.push({ id: `search_result_star${n}`, label: `Set to ${starsText(n)}`, onSelect: () => setStarsDialog(n) });
  }
  useToolbar({ title: presetName ?? 'Search results', actions, searchPrefill: type === 1 ? data : undefined });

  const allOf = (g: Group): SearchSubject[] => [...g.subjects, ...g.children.flatMap(allOf)];
  const toggle = (key: string): void =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const spans = resultSpans(width);
  const wideSpan = spans >= 6 ? 3 : spans;

  const card = (s: SearchSubject) => {
    const stage = cardStage(s, systems);
    const progress = cardProgressText(s, stage, state.now);
    const reading = s.object === 'kana_vocabulary' ? (s.characters ?? '') : oneReading(s, katakana);
    const wide = s.object === 'vocabulary' || s.object === 'kana_vocabulary';
    return (
      <div key={s.id} className="kk-card-cell" style={wide ? { gridColumn: `span ${wideSpan}` } : undefined}>
        <SubjectCard
          object={s.object}
          characters={s.characters ?? s.slug ?? ''}
          meaning={s.meanings.length > 0 ? oneMeaning(s.meanings) : null}
          reading={s.object === 'radical' || reading === '' ? null : reading}
          progress={progress}
          testId={`result-${s.id}`}
          onClick={() => navigate(paths.subject(s.id))}
        />
      </div>
    );
  };

  const renderGroup = (g: Group) => {
    const all = allOf(g);
    const isCollapsed = collapsed.has(g.key);
    const top = g.top || singleLevel;
    return (
      <section key={g.key} className="kk-result-group">
        <button type="button" className={`kk-result-header${top ? ' top' : ' sub'}`} aria-expanded={!isCollapsed} onClick={() => toggle(g.key)}>
          <svg className="kk-result-arrow" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d={isCollapsed ? 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z' : 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'} />
          </svg>
          <span className="kk-result-header-title">{headerTitle(g.title, all.length, systems, searchTime)}</span>
          <span className="kk-result-header-details">{headerDetails(all, systems, passedAt)}</span>
        </button>
        {!isCollapsed && (
          <>
            {g.subjects.length > 0 && (
              <div className="kk-result-grid" style={{ gridTemplateColumns: `repeat(${spans}, minmax(0, 1fr))` }}>{g.subjects.map(card)}</div>
            )}
            {g.children.map(renderGroup)}
          </>
        )}
      </section>
    );
  };

  const savePreset = (name: string): void => {
    setPresetDialog(null);
    if (name !== '') void save({ name, type, data }).then(() => toast(`Preset '${name}' saved`));
  };

  const tutorial = !prefBoolean(state.prefs, 'search_result_dismissed', false);

  return (
    <div className="kk-search-results">
      {tutorial && (
        <div className="kk-tip bleed" data-testid="results-tutorial">
          <p className="kk-tip-text">{RESULTS_TUTORIAL}</p>
          <div className="kk-tip-actions">
            <button type="button" className="kk-tip-btn" onClick={() => void app.setPreference('search_result_dismissed', true)}>Dismiss</button>
          </div>
        </div>
      )}
      <p className="kk-num-hits" data-testid="num-hits">
        {searchDescription(type, data)}: {shown.length} subject(s) found
      </p>

      {refining && run.parameters !== null && (
        <div className="kk-results-form">
          <AdvancedSearchFormView
            systems={systems}
            starRatingsEnabled={starsOn}
            initial={run.parameters}
            blocks={learner.ordering === 'JLPT' ? learner.blocks : []}
            onSearch={(p) => {
              setRefining(false);
              navigate(paths.searchResults(2, writeParameters(p)));
            }}
          />
        </div>
      )}

      {groups.map(renderGroup)}

      <ConfirmDialog
        open={presetDialog !== null}
        title="Preset name"
        confirmLabel="Save"
        onCancel={() => setPresetDialog(null)}
        onConfirm={() => savePreset(presetDialog ?? '')}
      >
        <p>Choose a name for the search preset</p>
        <input
          className="kk-preset-name"
          type="text"
          aria-label="Name"
          placeholder="Name"
          autoFocus
          value={presetDialog ?? ''}
          onChange={(e) => setPresetDialog(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            savePreset(presetDialog ?? '');
          }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={starsDialog !== null}
        title="Set star ratings?"
        confirmLabel="Yes"
        cancelLabel="No"
        onCancel={() => setStarsDialog(null)}
        onConfirm={() => {
          const n = starsDialog ?? 0;
          setStarsDialog(null);
          void stars.set(shown.map((s) => s.id), n).then(() => toast('Star ratings updated'));
        }}
      >
        <p>
          Do you want to set the star rating for {shown.length} subject{shown.length === 1 ? '' : 's'} to {starsDialog ?? 0} star
          {starsDialog === 1 ? '' : 's'}?
        </p>
      </ConfirmDialog>

      {burnDialog !== null && (
        <BurnResurrectDialog
          kind={burnDialog}
          subjects={(burnDialog === 'resurrect' ? resurrectable : burnable).map((s) => learner.content.byId.get(s.id)!)}
          run={(ids) => runBurnResurrect(app, burnDialog, ids)}
          onClose={() => setBurnDialog(null)}
        />
      )}
    </div>
  );
}
