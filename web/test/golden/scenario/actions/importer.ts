/** `importWaniKani {api}` (`ScenarioRunner.importWaniKani` → `WaniKaniImporter.apply`). */

import { applyWaniKaniImport, parseDownload, type WaniKaniApiData } from '../../../../src/core/importer';
import type { ActionHandler } from '../runner';

export const importerActions: Record<string, ActionHandler> = {
  importWaniKani: ({ rs, step }) => {
    const download = parseDownload(step.api as WaniKaniApiData);
    // resetProgress deletes the session items.
    delete rs.ext.session;
    return { summary: applyWaniKaniImport(rs.db, download, rs.now) };
  },
};
