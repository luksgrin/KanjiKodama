/** Fresh screenshots and findings for every run. */
import { rmSync } from 'node:fs';
import { SCREENSHOT_DIR } from './helpers/paths';

export default function globalSetup(): void {
  rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
}
