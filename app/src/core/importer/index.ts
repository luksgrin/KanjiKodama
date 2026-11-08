/**
 * WaniKani API objects to progress (download, apply). Fixtures:
 * scenarios/import-*, answers/synonyms-storage.json.
 */
export * from './api';
export { applyWaniKaniImport, importedLeechScore, parseDownload, type WaniKaniApiData, type WaniKaniDownload } from './apply';
