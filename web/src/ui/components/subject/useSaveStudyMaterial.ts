/**
 * Saving synonyms and notes from an item page (`SaveStudyMaterialJob`): the subject columns
 * `runLocal` writes, persisted, and in server mode also the study-material upload
 * (`db.assertSubmitStudyMaterialTask`). The item page screen and the session's item info both use it,
 * as Java's `SubjectInfoView` offers the "+" (add synonym) wherever it shows.
 */
import { useCallback, useState } from 'react';
import { updateProgress } from '../../../core/progression';
import { enqueueStudyMaterial } from '../../../sync/queue';
import { useApp } from '../../hooks/useApp';
import type { StudyMaterialSave } from './StudyMaterials';

export function useSaveStudyMaterial(): { onSave: (save: StudyMaterialSave) => Promise<void>; error: string | null } {
  const app = useApp();
  const [error, setError] = useState<string | null>(null);
  const onSave = useCallback(async (save: StudyMaterialSave) => {
    setError(null);
    try {
      await app.write((l) => updateProgress(l, save.subjectId, { ...save.columns }), { persist: { subjects: [save.subjectId] } });
      if (app.get().mode === 'server') {
        const { job } = save;
        await enqueueStudyMaterial(app.db, {
          subjectId: job.subjectId,
          meaningNote: job.meaningNote,
          readingNote: job.readingNote,
          meaningSynonyms: job.meaningSynonyms,
        }, app.clock.now());
      }
    } catch (e) {
      setError(`Could not save: ${String(e instanceof Error ? e.message : e)}`);
    }
  }, [app]);
  return { onSave, error };
}
