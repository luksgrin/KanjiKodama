/**
 * Resurrect and burn as a dialog: the texts and counters, the subjects listed, Start runs the local
 * patch (`resurrectLocal` / `burnLocal` through `runBurnResurrect`). Local mode only (there is no
 * "Stop": the local patch is instant).
 */
import { useState } from 'react';
import type { ContentSubject } from '../../../core/content';
import { burnLocal, isBurnable, isResurrectable, resurrectLocal } from '../../../core/progression';
import type { AppController } from '../../../app/appController';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SubjectChars } from '../../components/subject/SubjectChars';

export type BurnResurrectKind = 'resurrect' | 'burn';

const TEXTS = {
  resurrect: { title: 'Resurrect', intro: 'Resurrect the subjects listed below.', done: 'Resurrected', failed: 'Failed to resurrect', list: 'Subjects to resurrect:' },
  burn: { title: 'Burn', intro: 'Burn the subjects listed below.', done: 'Burned', failed: 'Failed to burn', list: 'Subjects to burn:' },
} as const;

/**
 * Patches the eligible subjects (`Subject.isResurrectable` / `isBurnable` at run time) in one write,
 * persisting just those rows. Returns how many were patched.
 */
export async function runBurnResurrect(app: AppController, kind: BurnResurrectKind, ids: readonly number[]): Promise<number> {
  const learner = app.requireLearner();
  const eligible = ids.filter((i) => (kind === 'resurrect' ? isResurrectable(learner, i) : isBurnable(learner, i)));
  if (eligible.length === 0) return 0;
  await app.write((l, now) => {
    for (const i of eligible) (kind === 'resurrect' ? resurrectLocal : burnLocal)(l, i, now);
  }, { persist: { subjects: eligible } });
  return eligible.length;
}

export interface BurnResurrectDialogProps {
  kind: BurnResurrectKind;
  subjects: readonly ContentSubject[];
  run: (ids: readonly number[]) => Promise<number>;
  onClose: () => void;
}

export function BurnResurrectDialog({ kind, subjects, run, onClose }: BurnResurrectDialogProps) {
  const t = TEXTS[kind];
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ done: number; failed: number; error: string | null } | null>(null);

  const start = async (): Promise<void> => {
    setBusy(true);
    try {
      const done = await run(subjects.map((s) => s.id));
      setResult({ done, failed: subjects.length - done, error: null });
    } catch (e) {
      setResult({ done: 0, failed: subjects.length, error: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open
      title={t.title}
      confirmLabel={result === null ? 'Start' : 'Close'}
      cancelLabel={result === null ? 'Cancel' : 'Close'}
      danger={kind === 'burn' && result === null}
      busy={busy}
      onConfirm={() => (result === null ? void start() : onClose())}
      onCancel={onClose}
    >
      <p>{t.intro}</p>
      <p className="kk-small" data-testid="burn-status">
        Status: {result === null ? (busy ? 'Working...' : '') : 'Finished'}
      </p>
      <p className="kk-small" data-testid="burn-counts">
        Total: {subjects.length} · {t.done}: {result?.done ?? 0} · {t.failed}: {result?.failed ?? 0}
      </p>
      {result?.error && <p className="kk-error-text">{result.error}</p>}
      <p className="kk-small">{t.list}</p>
      <ul className="kk-burn-list">
        {subjects.map((s) => (
          <li key={s.id} lang="ja"><SubjectChars subject={s} /></li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
