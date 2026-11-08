/**
 * Settings → the "Progress" category: Server
 * connection, Curriculum order, Kanji level test, Fast travel, Save progress to a file, Restore
 * progress from a file, Import progress from WaniKani, with their summaries; the local-only rows
 * are hidden in server mode.
 *
 * Save: the picker / share sheet, then "Progress saved.". Restore: pick, "Override local progress?"
 * with the file's summary and the override warning (Cancel / Restore and override), "Restoring
 * progress…", then "Progress restored, level N.".
 */
import { useEffect, useState } from 'react';
import { dateTime } from '../../../app/format';
import { serverPreferenceSummary } from '../../../core/server';
import { ServerStore } from '../../../sync/store';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { curriculumSummary } from '../curriculum/curriculumFlow';
import { OVERRIDE_WARNING } from '../import/importFlow';
import { errorMessage } from './progressFlow';
import { PrefCategory, PrefRow } from './SettingRows';
import type { Alerts } from './useAlerts';

export type Flow = (onDone?: () => void) => void;

export const SAVE_SUMMARY = 'Save a copy of your progress, for example to Google Drive (choose Drive in the file picker)';
export const RESTORE_SUMMARY = 'Replace local progress with a saved copy';

export function ProgressCategory({ alerts, flows }: { alerts: Alerts; flows: { curriculum: Flow; fastTravel: Flow; import: Flow } }) {
  const app = useApp();
  const nav = useNavigate();
  const { state, learner } = useReady();
  const local = state.mode !== 'server';
  const [baseUrl, setBaseUrl] = useState('');
  useEffect(() => {
    if (local) return;
    let live = true;
    new ServerStore(app.db).baseUrl().then((b) => { if (live) setBaseUrl(b ?? ''); }, () => undefined);
    return () => { live = false; };
  }, [app, local]);

  // Called straight from the tap: saveProgress builds the text synchronously (iOS user activation).
  const save = () => {
    app.saveProgress().then(
      (r) => { if (r.result === 'saved') alerts.message(null, 'Progress saved.'); },
      (e: unknown) => alerts.message('Something went wrong', errorMessage(e)),
    );
  };

  const restore = async () => {
    let opened;
    try {
      opened = await app.openProgressFile();
    } catch (e) {
      alerts.message('Something went wrong', errorMessage(e));
      return;
    }
    if (!opened) return;
    const text = opened.text;
    alerts.show({
      title: 'Override local progress?',
      message: `${opened.summary}\n\n${OVERRIDE_WARNING}`,
      testId: 'dialog-restore',
      onCancel: alerts.close,
      negative: { label: 'Cancel', onClick: alerts.close },
      positive: {
        label: 'Restore and override',
        onClick: () => void (async () => {
          const msg = await alerts.run('Restoring progress…', () => app.restoreProgress(text));
          if (msg !== undefined) alerts.message(null, msg);
        })(),
      },
    });
  };

  const saveSummary = `${SAVE_SUMMARY}${state.lastSavedAt === null ? '' : `. Last saved ${dateTime(state.lastSavedAt)}.`}`;
  return (
    <PrefCategory title="Progress" testId="category-progress">
      <PrefRow title="Server connection" summary={serverPreferenceSummary(!local, baseUrl)} testId="link-server" onClick={() => nav(paths.server())} />
      {local && (
        <>
          <PrefRow title="Curriculum order" summary={curriculumSummary(learner.progress.curriculum)} testId="link-curriculum" onClick={() => flows.curriculum()} />
          <PrefRow title="Kanji level test" summary="Two short quizzes estimate your JLPT kanji level; then you can start there" testId="link-level-test"
            onClick={() => nav(paths.levelTest())} />
          <PrefRow title="Fast travel" summary="JLPT order only: jump up to 5 levels ahead and prove what you already know" testId="link-fast-travel"
            onClick={() => flows.fastTravel()} />
        </>
      )}
      <PrefRow title="Save progress to a file" summary={saveSummary} testId="progress-save" onClick={save} />
      {local && (
        <>
          <PrefRow title="Restore progress from a file" summary={RESTORE_SUMMARY} testId="progress-restore" onClick={() => void restore()} />
          <PrefRow title="Import progress from WaniKani" summary="Replace local progress with your WaniKani account's progress, using an API token"
            testId="link-import" onClick={() => flows.import()} />
        </>
      )}
    </PrefCategory>
  );
}
