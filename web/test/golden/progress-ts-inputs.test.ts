/**
 * The TS-written progress files under `progress/ts-export/` (see progress-ts-inputs.ts): checks that
 * the committed files are what the TS core produces now and that each is settled (TS restore then
 * export at its `exportedAt` gives the same bytes).
 *
 * Regenerate: `WRITE_TS_PROGRESS_INPUTS=1 npx vitest run test/golden/progress-ts-inputs.test.ts`, then
 * re-run `ScenarioGoldenTest#progressTsExports` on the emulator (web/test/golden/README.md) and the
 * manifest.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLearnerDb, exportFromDb, restoreIntoDb } from '../../src/core/progression';
import { NO_CONTENT_DB_MESSAGE, hasContentDb, loadContentWithExtras } from './content';
import { GOLDEN_DIR } from './harness';
import { TS_EXPORT_DIR, buildTsProgressInputs } from './progress-ts-inputs';
import { loadJlptKanji } from './scenario/runner';

const dir = join(GOLDEN_DIR, TS_EXPORT_DIR);
const write = process.env.WRITE_TS_PROGRESS_INPUTS === '1';

describe.skipIf(!hasContentDb())(`${TS_EXPORT_DIR} inputs`, () => {
  it('are what the TS core writes, and settled', async () => {
    const content = await loadContentWithExtras();
    const res = { content, jlptKanji: loadJlptKanji() };
    const inputs = buildTsProgressInputs(res);
    for (const f of inputs) {
      const at = (JSON.parse(f.text) as { exportedAt: number }).exportedAt;
      const db = createLearnerDb(res.content, res.jlptKanji);
      restoreIntoDb(db, f.text, at);
      const again = exportFromDb(db, at);
      // The legacy file comes back under the current format tag.
      expect(again, `${f.name} is not settled`).toBe(f.text.replace('"mojimori-progress"', '"kanjikodama-progress"'));
    }
    if (write) {
      mkdirSync(dir, { recursive: true });
      for (const f of inputs) writeFileSync(join(dir, f.name), f.text);
    }
    expect(existsSync(dir) ? readdirSync(dir).sort() : []).toEqual(inputs.map((f) => f.name));
    for (const f of inputs) {
      expect(readFileSync(join(dir, f.name), 'utf8') === f.text, `${f.name} differs from what the TS core writes now`).toBe(true);
    }
  }, 300_000);
});

if (!hasContentDb()) console.warn(NO_CONTENT_DB_MESSAGE);
