/**
 * Server-mode texts, with the configured server's name (`serverLabel`) where they name the server
 * (including the API banners).
 */
import { serverLabel } from './serverUrl';

/** `ProgressPreferences.SERVER_WARNING`. */
export const SERVER_WARNING = 'Switching replaces ALL progress on this device with the server\'s.'
  + ' Local progress is not sent to the server. Save your current progress first if you might want it back.';

/** The token was rejected. */
export function tokenRejectedMessage(baseUrl: string): string {
  return `${serverLabel(baseUrl)} rejected this API token.`;
}
export function couldNotReachMessage(baseUrl: string): string {
  return `Could not reach ${serverLabel(baseUrl)}. Check the connection and try again.`;
}

/** The download was interrupted. */
export function downloadInterruptedMessage(baseUrl: string): string {
  return `The download from ${serverLabel(baseUrl)} was interrupted. Local progress was not changed.`;
}

/** No token for the download. */
export function noTokenMessage(baseUrl: string): string {
  return `There is no API token for ${serverLabel(baseUrl)}.`;
}

/** The migrate call couldn't reach the server. */
export function migrateUnreachableMessage(baseUrl: string): string {
  return `Could not reach ${serverLabel(baseUrl)}. Check the address and the connection.`;
}
export const MIGRATE_WANIKANI_REJECTED = 'WaniKani rejected this API token.';
export function migrateNotSupportedMessage(baseUrl: string): string {
  const server = serverLabel(baseUrl);
  return `${server} cannot copy data from WaniKani. Paste a token for ${server} instead.`;
}
export function migrateFailedMessage(baseUrl: string, status: number, error: string | null): string {
  return `${serverLabel(baseUrl)} could not copy the WaniKani data (${status})` + (error !== null ? `: ${error}` : '.');
}

/** The API error banner, naming the server. */
export function apiErrorBanner(baseUrl: string): string {
  const label = serverLabel(baseUrl);
  return label === 'WaniKani' ? 'There was an error talking to the WaniKani servers' : `There was an error talking to ${label}`;
}

/** The token-rejected banner, naming the server. */
export function apiKeyRejectedBanner(baseUrl: string): string {
  return `${serverLabel(baseUrl)} is not accepting your API token. Did you give your API token the correct permissions?`;
}

/** The server connection's status text. */
export function serverStatusMessage(baseUrl: string, pending: number): string {
  const label = serverLabel(baseUrl);
  return `Connected to ${label} (${baseUrl}). The server decides SRS stages, unlocks and level-ups.`
    + (pending > 0 ? `\n\n${pending} answers or notes have not been sent to ${label} yet.` : '');
}

/** The question before switching to local mode. */
export function switchToLocalQuestion(baseUrl: string, pending: number): string {
  const label = serverLabel(baseUrl);
  return 'Local mode starts over from the bundled content and works offline. You can bring this'
    + ` account's progress from ${label} along, or start at level 1.`
    + (pending > 0
      ? `\n\n${pending} answers or notes not yet sent to ${label} will be lost.`
        + ' To keep them, close this, use Sync now from the main menu and try again.'
      : '');
}

/** The question before switching to server mode. */
export function switchToServerQuestion(baseUrl: string, username: string | null, level: number): string {
  return `Connected to ${serverLabel(baseUrl)} as ${username}, level ${level}.\n\n${SERVER_WARNING}`;
}

/** `ProgressPreferences` after `switchToServer`. */
export function switchedToServerMessage(baseUrl: string): string {
  return `Server mode: downloading everything from ${serverLabel(baseUrl)}.`;
}

/** Switching to local mode from scratch. */
export const LOCAL_LEVEL_ONE = 'Local mode, starting at level 1.';
export function switchedToLocalMessage(importSummary: string): string {
  return `Local mode. ${importSummary}`;
}

/** `ProgressPreferences` progress_server summary. */
export function serverPreferenceSummary(serverMode: boolean, baseUrl: string): string {
  return !serverMode
    ? 'Local (offline). Tap to connect to a WaniKani-compatible server such as OpenKani.'
    : `Server mode: ${serverLabel(baseUrl)}. Tap to change.`;
}

/** Leaving server mode with unsent uploads, not confirmed. */
export function pendingUploadsBlockMessage(baseUrl: string, pending: number): string {
  return `${pending} answers or notes have not been sent to ${serverLabel(baseUrl)} yet.`;
}
