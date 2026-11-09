/**
 * Start a self-study quiz: the tutorial text, the search presets (Start / Delete) and the advanced
 * search form; the matching subjects become a self-study session, which never touches SRS. The form's
 * parameters are kept as the internal preset `"\u0000SELF_STUDY_DEFAULT"` and fill the form next time.
 *
 * Layout: the tutorial box with Dismiss, "Search presets:" (spinner,
 * Start, Delete, divider), "Selection criteria for self-study:" and the form; "Preset deleted" and "No
 * subjects found for self-study!" are toasts. While a session runs it offers Resume.
 */
import { useMemo, useState } from 'react';
import { writeParameters, type AdvancedSearchParameters } from '../../../core/search';
import { enableStarRatings } from '../../../core/settings/sessionUi';
import { prefBoolean } from '../../../core/settings';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { useStarRatings } from '../../components/subject';
import { SessionDialog } from '../../components/session/SessionDialog';
import { sessionPath } from '../../components/session/SessionScreen';
import { useSession } from '../../components/session/useSession';
import { AdvancedSearchFormView } from '../browse/AdvancedSearchFormView';
import { buildSearchSubjects, readSearchTexts, runSearch, type SearchType } from '../browse/searchData';
import { presetByName, presetNames, useSearchPresets } from '../browse/searchPresets';
import { parseParameters } from '../../../core/search';
import { toast } from '../../shell/toast';
import { useToolbar } from '../../shell/toolbar';
import '../../components/session/session.css';
import { WritingStartPanel } from '../writing/WritingStartPanel';

export const SELF_STUDY_DEFAULT_PRESET = '\u0000SELF_STUDY_DEFAULT';

export const SELF_STUDY_TUTORIAL = 'From this screen you can start a self-study quiz. The subjects for this quiz can be selected'
  + ' by filling out the search form below. If you have any search presets defined, you can also start a self-study'
  + " based on those directly. Go to 'Browse/search...' from the menu to define presets.\n\n"
  + 'Results from a self-study quiz are not reported to WaniKani. They don\'t affect your progress'
  + ' and are only for your own self-study purposes.';

export const NO_SUBJECTS = 'No subjects found for self-study!';

/**
 * The subjects of a search, for "Start self-study quiz" from the
 * search results too. Returns their ids in result order.
 */
export function useSelfStudySearch(): (type: SearchType, data: string) => number[] {
  const { learner, content, state } = useReady();
  const stars = useStarRatings();
  const texts = useMemo(() => readSearchTexts(content.db), [content.db]);
  return (type, data) => {
    const subjects = buildSearchSubjects(learner, texts, stars.ratings);
    const run = runSearch(subjects, type, data, {
      systems: learner.srsSystems, starRatingsEnabled: enableStarRatings(state.prefs), now: Date.now(),
    });
    return run.subjects.map((s) => s.id);
  };
}

export function SelfStudyScreen() {
  const app = useApp();
  const { learner, state } = useReady();
  const navigate = useNavigate();
  const { rt, snap } = useSession();
  const { presets, save, remove } = useSearchPresets();
  const search = useSelfStudySearch();
  const names = presetNames(presets);
  const [selected, setSelected] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preset = selected !== '' && names.includes(selected) ? selected : names[0] ?? '';
  const defaults = useMemo<AdvancedSearchParameters | null>(() => {
    const p = presetByName(presets, SELF_STUDY_DEFAULT_PRESET);
    if (p === null) return null;
    try {
      return parseParameters(p.data);
    } catch {
      return null;
    }
  }, [presets]);
  const dismissed = prefBoolean(state.prefs, 'start_self_study_dismissed', false);
  const session = snap.session;
  const running = session !== null && session.state !== 'INACTIVE';
  // The activity's label; Self-study quiz is not in its own menu.
  useToolbar({ title: 'Self-study quiz', actions: [{ id: 'self_study', label: 'Self-study quiz', hidden: true, onSelect: () => undefined }] });

  const startSession = async (type: SearchType, data: string, saveDefault: boolean): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      if (saveDefault && type === 2) await save({ name: SELF_STUDY_DEFAULT_PRESET, type: 2, data });
      const ids = search(type, data);
      const ok = ids.length > 0 && await rt.start('SELF_STUDY', ids);
      if (!ok) {
        toast(NO_SUBJECTS);
        return;
      }
      navigate(paths.selfStudyQuiz());
    } finally {
      setBusy(false);
    }
  };

  if (!snap.loaded) return <p className="kk-muted">Loading…</p>;
  if (running) {
    return (
      <>
        <div className="kk-panel" data-testid="self-study-running">
          <p>Finish or abandon your current lesson or review session first.</p>
          <button type="button" className="kk-btn block" onClick={() => navigate(sessionPath(session.type))}>Resume</button>
        </div>
        <WritingStartPanel />
      </>
    );
  }

  return (
    <div className="kk-self-study">
      {!dismissed && (
        <div className="kk-tutorial" data-testid="self-study-tutorial">
          <p className="kk-pre-line">{SELF_STUDY_TUTORIAL}</p>
          <button type="button" className="kk-tutorial-dismiss" onClick={() => void app.setPreference('start_self_study_dismissed', true)}>Dismiss</button>
        </div>
      )}
      <WritingStartPanel />
      {names.length > 0 && (
        <>
          <h2 className="kk-self-study-header">Search presets:</h2>
          <select value={preset} onChange={(e) => setSelected(e.target.value)} aria-label="Search preset" className="kk-select">
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="kk-self-study-presets">
            <button type="button" className="kk-btn" disabled={busy} onClick={() => {
              const p = presetByName(presets, preset);
              if (p !== null) void startSession(p.type as SearchType, p.data, false);
            }}>Start</button>
            <button type="button" className="kk-btn" onClick={() => setConfirmDelete(preset)}>Delete</button>
          </div>
          <hr className="kk-self-study-divider" />
        </>
      )}
      <h2 className="kk-self-study-header">Selection criteria for self-study:</h2>
      <AdvancedSearchFormView
        systems={learner.srsSystems}
        starRatingsEnabled={enableStarRatings(state.prefs)}
        initial={defaults}
        searchLabel="Start"
        showSortOrder={false}
        onSearch={(p) => void startSession(2, writeParameters(p), true)}
      />
      <SessionDialog
        open={confirmDelete !== null}
        title="Delete preset?"
        message={`Are you sure you want to delete the preset named '${confirmDelete ?? ''}'?`}
        onNo={() => setConfirmDelete(null)}
        onYes={() => {
          const name = confirmDelete;
          setConfirmDelete(null);
          if (name !== null) void remove(name).then(() => toast('Preset deleted'));
        }}
      />
    </div>
  );
}
