import { ServerAddressError, isWaniKaniUrl, normalizeServerUrl, serverLabel } from '../../src/core/server';
import { goldenSuite } from './harness';

/** `{value}`, or `{error, message}` with the error's type name. */
function attempt(call: () => string): { value: string } | { error: string; message: string } {
  try {
    return { value: call() };
  } catch (e) {
    if (e instanceof ServerAddressError) {
      return { error: 'IllegalArgumentException', message: e.message };
    }
    throw e;
  }
}

goldenSuite<{ raw: string }, unknown>('server/normalize.json', ({ raw }) => {
  const normalize = attempt(() => normalizeServerUrl(raw));
  const value = 'value' in normalize ? normalize.value : null;
  return {
    normalize,
    labelOfRaw: serverLabel(raw),
    isWaniKaniRaw: isWaniKaniUrl(raw),
    labelOfNormalized: value === null ? null : serverLabel(value),
    isWaniKaniNormalized: value === null ? null : isWaniKaniUrl(value),
  };
});
