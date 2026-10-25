/**
 * "My notes..." (`R.id.action_study_materials` → `StudyMaterialsActivity`): the notes form for one
 * subject, titled `subject.getInfoTitle("My notes for ", ":")`, over the current screen. Save writes
 * through `useSaveStudyMaterial` (locally, or queued for upload in server mode) and closes; back,
 * Escape and Cancel close without saving.
 */
import { useEffect, useId, useRef } from 'react';
import { parseMeaningSynonyms } from '../../../core/answer/synonyms';
import { contentSubject, progressRow, tableRow } from '../../../core/progression';
import { useReady } from '../../hooks/useApp';
import { useBackHandler } from '../../hooks/useRoute';
import { StudyMaterialsEditor } from './StudyMaterials';
import { infoTitle } from './subjectText';
import { useSaveStudyMaterial } from './useSaveStudyMaterial';

const text = (v: unknown): string | null => (typeof v === 'string' ? v : v === null || v === undefined ? null : String(v));

export function NotesDialog({ subjectId, onClose }: { subjectId: number | null; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { learner } = useReady();
  const { onSave, error } = useSaveStudyMaterial();
  const open = subjectId !== null;
  useBackHandler(() => { onClose(); return true; }, open);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  let body = null;
  if (subjectId !== null) {
    const subject = contentSubject(learner, subjectId);
    const row = progressRow(learner, subjectId);
    let synonyms: string[] = [];
    try {
      synonyms = parseMeaningSynonyms(text(row.meaningSynonyms));
    } catch {
      synonyms = [];
    }
    body = (
      <>
        <h2 id={titleId} className="kk-sdialog-title"><span>{`My notes for ${infoTitle(subject, tableRow(learner, subjectId).level)}:`}</span></h2>
        {error !== null && <p className="kk-banner error" role="alert">{error}</p>}
        <div className="kk-item kk-notes-dialog-body">
          <StudyMaterialsEditor
            key={subjectId}
            subjectId={subjectId}
            synonyms={synonyms}
            meaningNote={text(row.meaningNote)}
            readingNote={text(row.readingNote)}
            onSave={onSave}
            onDone={onClose}
          />
        </div>
        <div className="kk-sdialog-buttons">
          <span className="kk-sdialog-spacer" />
          <button type="button" className="kk-sdialog-btn negative" onClick={onClose}>Cancel</button>
        </div>
      </>
    );
  }
  return (
    <dialog ref={ref} className="kk-dialog kk-sdialog kk-notes-dialog" aria-labelledby={titleId} data-testid="notes-dialog"
      onCancel={(e) => { e.preventDefault(); onClose(); }}>
      {body}
    </dialog>
  );
}
