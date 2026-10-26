import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const WEB_DIR = fileURLToPath(new URL('../../../', import.meta.url));
/** Where test/e2e/serve.sh builds the app (git-ignored with node_modules/). */
export const DIST_DIR = join(WEB_DIR, 'node_modules', '.cache', 'kk-e2e', 'dist');
/** Per-device screenshots (git-ignored: they show WaniKani text). */
export const SCREENSHOT_DIR = join(WEB_DIR, 'test', 'e2e', 'screenshots');
/** The owner's real Android export (personal: only ever loaded into the local test browser). */
export const ANDROID_EXPORT = join(WEB_DIR, 'test', 'golden', 'progress', 'android-export.json');
