/** Start-up and write errors as the UI shows them. */

export type AppErrorCode =
  /** No content file (not built, or offline before it was ever downloaded). */
  | 'content-missing'
  /** A content file that can't be used (wrong schema, hash mismatch, unreadable). */
  | 'content-invalid'
  /** IndexedDB upgrade waits for another open tab/window of the app. */
  | 'db-blocked'
  /** The database was closed because a newer version of the app opened it elsewhere. */
  | 'db-closed'
  /** IndexedDB failed to open or read (private mode quirks, disk full, corruption). */
  | 'db-failed'
  | 'unknown';

export interface AppError {
  code: AppErrorCode;
  /** One sentence for the user. */
  message: string;
  /** Technical detail (the original error message), shown small. */
  detail?: string;
  /** Whether "Try again" can help without reloading the page. */
  retryable: boolean;
}

export class ContentMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentMissingError';
  }
}

const text = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function contentError(e: unknown): AppError {
  if (e instanceof ContentMissingError || (e instanceof TypeError && /fetch|network|load/i.test(e.message))) {
    return {
      code: 'content-missing',
      message: 'The kanji content is not available. Open the app once while online, or build it with "npm run content".',
      detail: text(e),
      retryable: true,
    };
  }
  return { code: 'content-invalid', message: 'The kanji content could not be read.', detail: text(e), retryable: true };
}

export function dbError(e: unknown): AppError {
  return {
    code: 'db-failed',
    message: 'Your progress database could not be opened. Nothing was changed.',
    detail: text(e),
    retryable: true,
  };
}

export const DB_BLOCKED: AppError = {
  code: 'db-blocked',
  message: 'KanjiKodama is open in another tab or window with an older version. Close it to continue.',
  retryable: false,
};

export const DB_CLOSED: AppError = {
  code: 'db-closed',
  message: 'A newer version of KanjiKodama was opened in another tab. Reload to continue.',
  retryable: false,
};

export function errorText(e: unknown): string {
  return text(e);
}
