/**
 * Search results (`fragments/SearchResultFragment` with `adapter/search/SearchResultAdapter`):
 * "<description>: n subject(s) found", the hits under collapsible headers in the search's sort order
 * (`resultView`), subject cards (`SubjectCardBinder`: type colour, characters, meaning, reading, the
 * stage and next review, here on the stage's colour), and the "Search result..." menu as buttons:
 * Refine search (not for keyword searches), Save preset, Start self-study quiz (when there are hits;
 * while a session runs it just opens that session, as Java's `goToActivity(SessionActivity)` does),
 * Resurrect burned items / Burn resurrected items (local mode), Set star rating (with
 * `enable_star_ratings`).
 *
 * Route `/browse/results?t=<0|1|2>&q=<level|query|parameters JSON>[&preset=<name>]`.
 * Added: subject type filter buttons above the list (they narrow the list and the menu actions).
 */
import { useMemo, useState } from 'react';
import { SUBJECT_TYPE_BY_OBJECT, SUBJECT_TYPES, type SubjectTypeName } from '../../../core/content';
import { toKatakana } from '../../../core/kana';
import { isBurnable, isResurrectable, num, progressRow } from '../../../core/progression';
import { oneMeaning, writeParameters, type SearchSubject } from '../../../core/search';
import { enableStarRatings, showOnInKatakana } from '../../../core/settings/subjectInfo';
import type { SrsSystem } from '../../../core/srs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { formatTimestamp, starsText, useStarRatings } from '../../components/subject';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate, useRoute } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { BurnResurrectDialog, runBurnResurrect, type BurnResurrectKind } from '../subject/BurnResurrectDialog';
import { AdvancedSearchFormView } from './AdvancedSearchFormView';
import {
  buildSearchSubjects,
  cardProgressText,
  headerDetails,
  readSearchTexts,
  resultView,
  runSearch,
  searchDescription,
  stageColorName,
  stageOfSearchSubject,
  type SearchType,
} from './searchData';
import { useSearchPresets } from './searchPresets';
import { sessionPath, sessionRuntime, useActiveSession } from '../../components/session';
import './browse.css';

/** `SubjectType` description / plural (`ItemTypeHeaderItemViewHolder`). */
const TYPE_TEXT: Readonly<Record<SubjectTypeName, [string, string]>> = {
  WANIKANI_RADICAL: ['Radical', 'Radicals'],
  WANIKANI_KANJI: ['Kanji', 'Kanji'],
  WANIKANI_VOCAB: ['Vocabulary', 'Vocabulary'],
  WANIKANI_KANA_VOCAB: ['Kana-only Vocabulary', 'Vocabulary'],
};

/** The filter buttons' labels. */
const TYPE_FILTER_LABEL: Readonly<Record<SubjectTypeName, string>> = {
  WANIKANI_RADICAL: 'Radicals',
  WANIKANI_KANJI: 'Kanji',
  WANIKANI_VOCAB: 'Vocabulary',
  WANIKANI_KANA_VOCAB: 'Kana vocabulary',
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

export function SearchResultsScreen() {
  const app = useApp();
  const { learner, content, state } = useReady();
  const { query } = useRoute();
  const navigate = useNavigate();
  const stars = useStarRatings();
  const { save } = useSearchPresets();
  const activeSession = useActiveSession();
  const [starting, setStarting] = useState(false);

  const rawType = Number(query.get('t') ?? '0');
  const type: SearchType = rawType === 1 || rawType === 2 ? rawType : 0;
  const data = query.get('q') ?? '1';
  const presetName = query.get('preset');

  const [searchTime] = useState(() => app.clock.now());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [types, setTypes] = useState<ReadonlySet<SubjectTypeName>>(new Set());
  const [refining, setRefining] = useState(false);
  const [presetDialog, setPresetDialog] = useState<string | null>(null);
  const [starsDialog, setStarsDialog] = useState<number | null>(null);
  const [burnDialog, setBurnDialog] = useState<BurnResurrectKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const starsOn = enableStarRatings(state.prefs);
  const katakana = showOnInKatakana(state.prefs);
  const systems = learner.srsSystems;
  const texts = useMemo(() => readSearchTexts(content.db), [content.db]);
  const subjects = useMemo(() => buildSearchSubjects(learner, texts, stars.ratings), [learner, texts, stars.ratings, state.revision]);
  const run = useMemo(
    () => runSearch(subjects, type, data, { systems, starRatingsEnabled: starsOn, now: searchTime }),
    [subjects, type, data, systems, starsOn, searchTime],
  );
  const shown = useMemo(
    () => (types.size === 0 ? run.subjects : run.subjects.filter((s) => types.has(SUBJECT_TYPE_BY_OBJECT[s.object]))),
    [run.subjects, types],
  );
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

  const allOf = (g: Group): SearchSubject[] => [...g.subjects, ...g.children.flatMap(allOf)];
  const toggle = (key: string): void =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const card = (s: SearchSubject) => {
    const stage = stageOfSearchSubject(s, systems);
    const progress = cardProgressText(s, stage, state.now);
    const reading = s.object === 'kana_vocabulary' ? (s.characters ?? '') : oneReading(s, katakana);
    return (
      <button
        key={s.id}
        type="button"
        className={`kk-result-card ${s.object}`}
        data-testid={`result-${s.id}`}
        onClick={() => navigate(paths.subject(s.id))}
      >
        <span className="kk-result-chars" lang="ja">{s.characters ?? s.slug ?? ''}</span>
        {s.meanings.length > 0 && <span className="kk-result-meaning">{oneMeaning(s.meanings)}</span>}
        {reading !== '' && <span className="kk-result-reading" lang="ja">{reading}</span>}
        <span className={`kk-result-stage kk-stage--${stageColorName(stage)}`}>{progress ?? stage.name}</span>
      </button>
    );
  };

  const renderGroup = (g: Group) => {
    const all = allOf(g);
    const isCollapsed = collapsed.has(g.key);
    return (
      <section key={g.key} className="kk-result-group">
        <button type="button" className={`kk-result-header${g.top ? ' top' : ''}`} aria-expanded={!isCollapsed} onClick={() => toggle(g.key)}>
          <span className="kk-result-arrow" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
          <span className="kk-result-header-title">{headerTitle(g.title, all.length, systems, searchTime)}</span>
          <span className="kk-result-header-details">{headerDetails(all, systems, passedAt)}</span>
        </button>
        {!isCollapsed && (
          <>
            {g.subjects.length > 0 && <div className="kk-result-grid">{g.subjects.map(card)}</div>}
            {g.children.map(renderGroup)}
          </>
        )}
      </section>
    );
  };

  /** `action_search_result_self_study`: the shown hits become a self-study session. */
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

  const toggleType = (t: SubjectTypeName): void =>
    setTypes((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <div className="kk-search-results">
      {toast !== null && <p className="kk-banner ok" role="status">{toast}</p>}
      {presetName !== null && <h2 className="kk-search-results-head">{presetName}</h2>}
      <p className="kk-search-results-head" data-testid="num-hits">
        {searchDescription(type, data)}: {shown.length} subject(s) found
      </p>

      <div className="kk-search-actions">
        {type !== 1 && (
          <button type="button" className="kk-btn small secondary" aria-expanded={refining} onClick={() => setRefining((r) => !r)}>
            Refine search
          </button>
        )}
        <button type="button" className="kk-btn small secondary" onClick={() => setPresetDialog(presetName ?? '')}>Save preset</button>
        {shown.length > 0 && (
          <button type="button" className="kk-btn small secondary" data-testid="start-self-study" disabled={starting}
            onClick={() => void startSelfStudy()}>
            Start self-study quiz
          </button>
        )}
        {resurrectable.length > 0 && (
          <button type="button" className="kk-btn small secondary" onClick={() => setBurnDialog('resurrect')}>Resurrect burned items</button>
        )}
        {burnable.length > 0 && (
          <button type="button" className="kk-btn small secondary" onClick={() => setBurnDialog('burn')}>Burn resurrected items</button>
        )}
        {starsOn && shown.length > 0 && (
          <select
            aria-label="Set star rating"
            value=""
            onChange={(e) => e.target.value !== '' && setStarsDialog(Number(e.target.value))}
          >
            <option value="">Set star rating...</option>
            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Set to {starsText(n)}</option>)}
          </select>
        )}
      </div>

      {refining && run.parameters !== null && (
        <div className="kk-panel">
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

      <div className="kk-segmented kk-type-filter" role="group" aria-label="Subject types">
        {SUBJECT_TYPES.map((t) => (
          <button key={t} type="button" className={`kk-btn small${types.has(t) ? '' : ' secondary'}`} aria-pressed={types.has(t)} onClick={() => toggleType(t)}>
            {TYPE_FILTER_LABEL[t]}
          </button>
        ))}
      </div>

      {groups.map(renderGroup)}

      <ConfirmDialog
        open={presetDialog !== null}
        title="Preset name"
        confirmLabel="Save"
        onCancel={() => setPresetDialog(null)}
        onConfirm={() => {
          const name = presetDialog ?? '';
          setPresetDialog(null);
          if (name !== '') void save({ name, type, data }).then(() => setToast(`Preset '${name}' saved`));
        }}
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
            const name = presetDialog ?? '';
            setPresetDialog(null);
            if (name !== '') void save({ name, type, data }).then(() => setToast(`Preset '${name}' saved`));
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
          void stars.set(shown.map((s) => s.id), n).then(() => setToast('Star ratings updated'));
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
