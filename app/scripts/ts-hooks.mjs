// Lets Node run the TypeScript scripts with its built-in type stripping (Node >= 22.18): the sources
// import each other without extensions (Vite/"bundler" style), so try `<specifier>.ts` and
// `<specifier>/index.ts` when a relative import does not resolve as written.
// Usage: node --import ./scripts/ts-hooks.mjs scripts/build-content.ts ...
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.') || /\.[cm]?[jt]s$/.test(specifier)) throw error;
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return nextResolve(candidate, context);
        } catch {
          // try the next one
        }
      }
      throw error;
    }
  },
});
