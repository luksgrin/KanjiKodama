/**
 * Focused checks of core/session's selection and question order against the session start steps
 * recorded in the golden scenarios, before the session engine replays them end to end: for every
 * `sessionStart` the selected items (order and bucket) and the first question must match, drawing
 * from the scenario's shared seeded random in the same order as Java. The queue is taken from the
 * fixture (building it is the engine's job).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { QuestionType } from '../../src/core/answer';
import { LOCAL_MAX_LEVEL_GRANTED, levelUpIds, orderSubject, type StartType } from '../../src/core/session/order';
import { chooseNextQuestion } from '../../src/core/session/orderQuestions';
import { settingsOrdering } from '../../src/core/session/ordering';
import { selectSessionSubjects } from '../../src/core/session/selection';
import type { SessionContext, SessionSubject } from '../../src/core/session/types';
import { contentSubject, progressRow, srsSystemOf, tableRow, type LearnerDb } from '../../src/core/progression';
import { JavaRandom, shuffleInPlace } from '../../src/core/rng';
import type { Preferences } from '../../src/core/settings';
import { hasContentDb, loadContentWithExtras } from '../golden/content';
import { loadJlptKanji, startScenario, type StartInput } from '../golden/scenario/runner';

interface RecordedItem {
  id: number;
  order: number;
  bucket: number;
  choiceDelay: number;
  numAnswers: number;
  done: boolean[];
}

interface Case {
  name: string;
  input: Record<string, unknown>;
  output: { result?: { session?: { state: string; current: [number, QuestionType] | null; queue: [number, QuestionType][]; items: RecordedItem[] } } };
}

const SCENARIOS = [
  'session-order-lesson',
  'session-order-review',
  'session-order-self-study',
  'session-size-review',
  'session-sequence-lesson-back-to-back',
  'session-sequence-lesson-default',
  'session-sequence-lesson-meaning-first-back-to-back',
  'session-sequence-lesson-reading-first',
  'session-sequence-review-back-to-back-reading-first',
  'session-sequence-review-back-to-back',
  'session-sequence-review-default',
  'session-sequence-review-meaning-first',
  'session-sequence-review-reading-and-meaning-first',
  'session-sequence-review-reading-first',
  'session-sequence-review-type-order-buckets',
  'session-sequence-self-study-meaning-first',
];

describe.skipIf(!hasContentDb())('session selection and first question vs. recorded session starts', () => {
  for (const name of SCENARIOS) {
    it(name, async () => {
      const fixture = JSON.parse(readFileSync(new URL(`../golden/scenarios/${name}.json`, import.meta.url), 'utf8')) as { cases: Case[] };
      const [start, ...steps] = fixture.cases;
      const rs = startScenario(name, start!.input as unknown as StartInput, { content: await loadContentWithExtras(), jlptKanji: loadJlptKanji() }, false);
      let checked = 0;
      for (const c of steps) {
        if (c.input.action !== 'sessionStart') {
          // Abandoning draws nothing; any other action is the engine's (only the first start is checked then).
          if (c.input.action === 'sessionAbandon') continue;
          break;
        }
        const args = c.input.args as { type: StartType };
        const resolved = c.input.resolved as { settings: Preferences; ids: number[] };
        rs.now = c.input.atMs as number;
        const session = c.output.result?.session;
        if (resolved.ids.length === 0 || session === undefined) continue;

        const prefs = resolved.settings;
        const rngBefore = Object.assign(Object.create(JavaRandom.prototype) as JavaRandom, rs.rng);
        const userLevel = rs.db.progress.userLevel;
        const subjects = resolved.ids.map((id) => orderSubject(rs.db, id, rs.now, prefs));
        const sel = selectSessionSubjects(subjects, args.type, prefs,
          { userLevel, maxLevel: LOCAL_MAX_LEVEL_GRANTED, levelUp: levelUpIds(rs.db, userLevel, LOCAL_MAX_LEVEL_GRANTED) }, rs.rng);
        expect(sel.subjects.map((s, i) => [s.id, i, sel.buckets[i]]), `${c.name} items`)
          .toEqual(session.items.map((it) => [it.id, it.order, it.bucket]));
        // The same selection through the engine-facing SessionOrdering, on a copy of the random.
        expect(viaOrdering(rs.db, args.type, prefs, rs.now, resolved.ids, rngBefore), `${c.name} via settingsOrdering`)
          .toEqual(session.items.map((it) => [it.id, it.bucket]));

        if (session.state === 'ACTIVE') {
          const items = new Map(session.items.map((it) => [it.id, { ...it }]));
          const current = chooseNextQuestion(session.queue, [...items.values()], {
            backToBack: prefs[`${prefixOf(args.type)}_back_to_back`] === true && prefs.enable_advanced === true,
            readingFirst: prefs[`${prefixOf(args.type)}_reading_first`] === true && prefs.enable_advanced === true,
            meaningFirst: prefs[`${prefixOf(args.type)}_meaning_first`] === true && prefs.enable_advanced === true,
          }, {
            itemOf: (q) => items.get(q[0])!,
            typeOf: (q) => q[1],
            isStarted: (i) => i.numAnswers > 0,
            hasPendingReadingAndMeaning: (i) => !i.done[0] && !(i.done[1] && i.done[2] && i.done[3]),
            bucket: (i) => i.bucket,
            choiceDelay: (i) => i.choiceDelay,
            setChoiceDelay: (i, v) => {
              i.choiceDelay = v;
            },
          }, rs.rng);
          expect(current, `${c.name} current`).toEqual(session.current);
        } else {
          // The lesson presentation shows the first question without drawing.
          expect(session.queue[0], `${c.name} current`).toEqual(session.current);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  }
});

function prefixOf(type: StartType): string {
  return type === 'LESSON' ? 'lesson' : type === 'REVIEW' ? 'review' : 'self_study';
}

/** `Session.populateItems`' selection steps the way the engine drives `settingsOrdering`. */
function viaOrdering(db: LearnerDb, type: StartType, prefs: Preferences, now: number, ids: number[], rng: JavaRandom): [number, number][] {
  const ctx: SessionContext = { db, prefs, now, rng };
  const subjects: SessionSubject[] = ids.map((id) => ({
    id, content: contentSubject(db, id), table: tableRow(db, id), progress: progressRow(db, id), srsSystem: srsSystemOf(db, id),
  }));
  let comparator = settingsOrdering.comparator(type, ctx);
  const maxSize = settingsOrdering.maxSize(type, prefs);
  let list = [...subjects];
  if (settingsOrdering.shuffleBeforeSort(type, prefs)) shuffleInPlace(list, rng);
  list.sort(comparator);
  if (list.length > maxSize) list = settingsOrdering.trimSelection(list, maxSize, type, ctx, comparator);
  if (settingsOrdering.shuffleAfterSelection(type, prefs)) comparator = () => 0;
  let bucket = 0;
  return list.map((s, i) => {
    if (i > 0 && comparator(list[i - 1]!, s) !== 0) bucket++;
    return [s.id, bucket];
  });
}
