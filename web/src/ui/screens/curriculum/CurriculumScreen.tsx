/**
 * Settings → Curriculum order: `CurriculumUi.chooseCurriculum` / `confirmSwitch`. Pick the other
 * order, see where you would land (`Curriculum.preview`), confirm, switch (`Curriculum.switchTo`
 * through `app.write`). Local mode only (`LocalMode.LOCAL_PREFERENCES`).
 */
import { useState } from 'react';
import { CURRICULUM_MODE_LABEL, type CurriculumMode, type CurriculumPreview } from '../../../core/curriculum';
import { currentLevelDescription, previewCurriculum, switchCurriculum } from '../../../core/progression';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Panel';
import { useApp, useReady } from '../../hooks/useApp';
import { LocalOnly } from '../settings/LocalOnly';
import { SESSION_RUNNING, afterProgressChange, errorMessage, paren, sessionRunning } from '../settings/progressFlow';
import '../settings/settings.css';

const MODES: readonly { mode: CurriculumMode; label: string }[] = [
  { mode: 'WANIKANI', label: "WaniKani order: WaniKani's 60 levels" },
  { mode: 'JLPT', label: 'JLPT order: N5, N4, N3, N2, N1, then Obscure (kanji on no JLPT list). Allows fast travel.' },
];

/** `confirmSwitch`'s message. */
export function switchMessage(p: CurriculumPreview): string {
  let msg = `You would be placed on level ${p.placement.level}`;
  if (p.levelDescription !== null) msg += ` (${p.levelDescription})`;
  msg += ': the first level where you have mastered less than 60% of the kanji.\n\n';
  if (p.placement.backfill > 0) {
    msg += `${p.placement.backfill} kanji below that level are not mastered yet. Any of them that are still locked unlock right away as lessons.\n\n`;
  }
  return msg + 'Your progress on every item is kept; only the order of new lessons changes. You can switch back at any time.';
}

function Curriculum() {
  const app = useApp();
  const { learner, platform } = useReady();
  const current = learner.progress.curriculum;
  const [preview, setPreview] = useState<CurriculumPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);

  const choose = async (mode: CurriculumMode) => {
    setStatus(null);
    if (mode === current) return;
    if (await sessionRunning(app)) { setStatus({ error: true, text: SESSION_RUNNING }); return; }
    setPreview(previewCurriculum(app.requireLearner(), mode));
  };

  const confirm = async () => {
    if (!preview) return;
    const target = preview.target;
    if (await sessionRunning(app)) { setPreview(null); setStatus({ error: true, text: SESSION_RUNNING }); return; }
    setBusy(true);
    try {
      const placement = await app.write((l, now) => switchCurriculum(l, target, now), { persist: 'all' });
      const where = currentLevelDescription(app.requireLearner(), placement.level);
      setStatus({ error: false, text: `You are now in ${CURRICULUM_MODE_LABEL[target]}, on level ${placement.level}${paren(where)}.` });
      afterProgressChange(app, platform);
    } catch (e) {
      setStatus({ error: true, text: `The switch failed, nothing changed: ${errorMessage(e)}` });
    } finally {
      setBusy(false);
      setPreview(null);
    }
  };

  return (
    <Panel title="Curriculum order">
      <p className="kk-small kk-muted" data-testid="curriculum-summary">{CURRICULUM_MODE_LABEL[current]}. Tap to switch; progress on every item is kept.</p>
      <ul className="kk-choice-list" role="radiogroup" aria-label="Curriculum order">
        {MODES.map((m) => (
          <li key={m.mode}>
            <button type="button" role="radio" className="kk-choice" aria-checked={m.mode === current} disabled={busy}
              data-testid={`curriculum-${m.mode}`} onClick={() => void choose(m.mode)}>
              <span className="kk-choice-title">{CURRICULUM_MODE_LABEL[m.mode]}</span>
              <span className="kk-choice-sub">{m.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {status && <p role="status" data-testid="curriculum-status" className={`kk-small${status.error ? ' kk-error-text' : ''}`}>{status.text}</p>}
      <ConfirmDialog open={preview !== null} title={preview ? `Switch to ${CURRICULUM_MODE_LABEL[preview.target]}?` : ''}
        confirmLabel="Switch" busy={busy} onConfirm={() => void confirm()} onCancel={() => setPreview(null)}>
        <p className="kk-pre-line" data-testid="curriculum-confirm">{preview ? switchMessage(preview) : ''}</p>
      </ConfirmDialog>
    </Panel>
  );
}

export function CurriculumScreen() {
  return <LocalOnly><Curriculum /></LocalOnly>;
}
