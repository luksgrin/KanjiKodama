import { describe, expect, it } from 'vitest';
import { shouldSyncOnResume } from '../../src/sync/deviceSync';

describe('shouldSyncOnResume (Java AbstractActivity.onResume)', () => {
  const on = { sync_on_open: true };
  it('is off by default', () => expect(shouldSyncOnResume({}, 1, 1 + 10 * 60_000)).toBe(false));
  it('syncs after more than 3 minutes away', () => expect(shouldSyncOnResume(on, 1000, 1000 + 3 * 60_000 + 1)).toBe(true));
  it('not at exactly 3 minutes', () => expect(shouldSyncOnResume(on, 1000, 1000 + 3 * 60_000)).toBe(false));
  it('not without a pause first', () => expect(shouldSyncOnResume(on, 0, 10 * 60_000)).toBe(false));
});
