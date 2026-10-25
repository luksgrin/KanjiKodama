/**
 * Server mode (issue #2, plan step 5c): the API client, the upload queue, the sync engine and the
 * mode switches. No UI here. Pure decisions and texts are core `server/`.
 *
 * Typical UI flow:
 *   const http = await getHttp();                                  // platform
 *   const base = normalizeServerUrl(typed);                        // core: ServerAddressError
 *   const token = await migrateFromWaniKani({ http, baseUrl: base, wkApiKey }); // optional
 *   const user = await checkConnection({ http, baseUrl: base, token });        // "test connection"
 *   await backupBeforeServerSwitch(db, platform.files);           // the backup offer
 *   await switchToServer(db, { baseUrl: base, token, user });
 *   const engine = new SyncEngine({ kk: db, http, appVersion });
 *   await engine.syncNow();                                        // on open, on resume, "Sync now" ({manual: true})
 *   await enqueueReview(db, {...}); void engine.flushUploads();    // after each answer
 *   await engine.status();                                         // banner, pending, max level
 *   await flushBeforeLeaving(engine); await switchToLocal(db, {..., download: await downloadForLocal(db, { http })});
 */
export * from './client';
export * from './engine';
export * from './modeSwitch';
export * from './queue';
export { resetServerData } from './reset';
export { KEYS as SERVER_STATE_KEYS, ServerStore, stateTokenStore, type AppMode, type TokenStore, type Validators } from './store';
