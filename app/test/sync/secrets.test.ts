/** The token moves from the progress DB's `state` to the platform secrets; web secrets in their own IndexedDB. */
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

import { createAndroidSecrets } from '../../src/platform/androidSecrets';
import { createWebSecrets } from '../../src/platform/webSecrets';
import { secretsTokenStore, TOKEN_SECRET_KEY } from '../../src/sync/secretsTokenStore';
import { KEYS, ServerStore } from '../../src/sync/store';
import { openDb } from './helpers';

const memory = () => {
  const m = new Map<string, string>();
  return { kind: 'memory' as const, m, get: vi.fn(async (k: string) => m.get(k) ?? null), set: vi.fn(async (k: string, v: string | null) => { if (v === null) m.delete(k); else m.set(k, v); }) };
};

describe('secretsTokenStore', () => {
  it('moves an existing state token into the secrets once and deletes the old row', async () => {
    const kk = await openDb();
    await kk.state.put({ key: KEYS.token, value: 'old-token' });
    const secrets = memory();
    const tokens = secretsTokenStore(secrets, kk);
    expect(await tokens.get()).toBe('old-token');
    expect(secrets.m.get(TOKEN_SECRET_KEY)).toBe('old-token');
    expect(await kk.state.get(KEYS.token)).toBeUndefined();
    expect(await new ServerStore(kk, tokens).flags()).toMatchObject({ hasToken: true });
  });

  it('keeps a newer secret over a leftover state row; set/clear go to the secrets only', async () => {
    const kk = await openDb();
    await kk.state.put({ key: KEYS.token, value: 'stale' });
    const secrets = memory();
    secrets.m.set(TOKEN_SECRET_KEY, 'current');
    const tokens = secretsTokenStore(secrets, kk);
    expect(await tokens.get()).toBe('current');
    await tokens.set('next');
    expect(secrets.m.get(TOKEN_SECRET_KEY)).toBe('next');
    expect(await kk.state.get(KEYS.token)).toBeUndefined();
    await tokens.set(null);
    expect(await tokens.get()).toBeNull();
  });

  it('web secrets live in their own database, not in the progress DB', async () => {
    const s = createWebSecrets(`kk-secrets-${Math.random()}`);
    expect(s.kind).toBe('indexeddb');
    await s.set('a', 'b');
    expect(await s.get('a')).toBe('b');
    await s.set('a', null);
    expect(await s.get('a')).toBeNull();
  });

  it('android secrets call the Keystore plugin', async () => {
    const plugin = { get: vi.fn(async () => ({ value: 'x' })), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    const s = createAndroidSecrets(plugin);
    expect(await s.get('k')).toBe('x');
    await s.set('k', 'v');
    await s.set('k', null);
    expect(plugin.set).toHaveBeenCalledWith({ key: 'k', value: 'v' });
    expect(plugin.remove).toHaveBeenCalledWith({ key: 'k' });
  });
});
