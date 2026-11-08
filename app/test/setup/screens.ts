/**
 * Vitest setup: in jsdom tests, load every lazily loaded screen chunk (src/ui/screens/index.ts)
 * before the tests (after the test file's own imports, e.g. fake-indexeddb/auto) so screens render
 * synchronously after a navigation, as with static imports.
 */
import { beforeAll } from 'vitest';

if (typeof document !== 'undefined') {
  beforeAll(async () => {
    const { preloadAllScreens } = await import('../../src/ui/screens');
    await preloadAllScreens();
  });
}
