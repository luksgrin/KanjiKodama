/**
 * Search by parts (the radical picker): RADKFILE's parts grouped by stroke count (`content` table
 * `radical`, core `search/parts`). Tapping parts narrows the kanji down to those containing all of
 * them; parts that no longer occur in any of those kanji are greyed out. The bar under the toolbar
 * stays in view: the selected parts (tap one to drop it), the number of kanji found (tap to jump to
 * them) and Clear, and once few enough are left ({@link MAX_QUICK}), the kanji themselves (tap one to
 * open it). Below the parts, the kanji found as result cards in the current curriculum's order, at
 * most {@link MAX_SHOWN}. Only visible kanji count (the JLPT extras too, when the curriculum shows
 * them). Toolbar title "Parts" (longer titles get cut short on phones).
 *
 * Route `/browse/parts[?p=<parts>]`: the selection lives in the URL, so coming back from a kanji keeps it.
 */
import { useMemo, useRef } from 'react';
import { radicalEntries } from '../../../content/contentFile';
import {
  buildPartIndex,
  formatPartSelection,
  oneMeaning,
  parsePartSelection,
  partGroups,
  searchByParts,
  type SearchSubject,
} from '../../../core/search';
import { showOnInKatakana } from '../../../core/settings/subjectInfo';
import { SubjectChars } from '../../components/subject';
import { oneReading } from '../../components/subject/subjectText';
import { useReady } from '../../hooks/useApp';
import { useNavigate, useRoute } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { useToolbar } from '../../shell/toolbar';
import { buildSearchSubjects, cardProgressText, cardStage } from './searchData';
import { SubjectCard } from './SubjectCard';
import './browse.css';

/** Result cards shown at most; more parts narrow the rest down. */
export const MAX_SHOWN = 120;
/** Up to this many kanji found, the bar shows them too. */
export const MAX_QUICK = 8;

export const PARTS_HINT = 'Tap the parts you see in a kanji to find it.';

export function PartsSearchScreen() {
  const { learner, content, state } = useReady();
  const { query } = useRoute();
  const navigate = useNavigate();
  const resultsRef = useRef<HTMLHeadingElement>(null);
  useToolbar({ title: 'Parts' });

  const systems = learner.srsSystems;
  const katakana = showOnInKatakana(state.prefs);
  const entries = useMemo(() => (content.db ? radicalEntries(content.db) : []), [content.db]);
  /** The visible kanji by character. */
  const kanji = useMemo(() => {
    const out = new Map<string, SearchSubject>();
    for (const s of buildSearchSubjects(learner, new Map(), new Map())) {
      if (s.object === 'kanji' && s.hiddenAt === 0 && s.characters !== null) out.set(s.characters, s);
    }
    return out;
  }, [learner, state.revision]);
  const index = useMemo(() => buildPartIndex(entries, (k) => kanji.has(k)), [entries, kanji]);
  const groups = useMemo(() => partGroups(index), [index]);

  const selected = parsePartSelection(index, query.get('p') ?? '');
  const selectedSet = new Set(selected);
  const search = useMemo(() => searchByParts(index, selected), [index, selected.join('')]);
  const found = useMemo(
    () => search.kanji.flatMap((k) => kanji.get(k) ?? [])
      .sort((a, b) => a.level - b.level || a.lessonPosition - b.lessonPosition || a.id - b.id),
    [search, kanji],
  );
  const shown = found.slice(0, MAX_SHOWN);

  const select = (parts: string[]): void => navigate(paths.partsSearch(formatPartSelection(parts)), { replace: true });
  const toggle = (part: string): void => select(selectedSet.has(part) ? selected.filter((p) => p !== part) : [...selected, part]);

  if (index.entries.length === 0) {
    return <p className="kk-parts-empty">This content file has no parts data.</p>;
  }

  return (
    <div className="kk-parts">
      <div className="kk-parts-bar" data-testid="parts-bar">
        {selected.length === 0 ? (
          <p className="kk-parts-hint">{PARTS_HINT}</p>
        ) : (
          <>
            <div className="kk-parts-selected">
              {selected.map((p) => (
                <button key={p} type="button" className="kk-part selected" lang="ja" aria-label={`Remove ${p}`} onClick={() => toggle(p)}>
                  {p}
                </button>
              ))}
            </div>
            <div className="kk-parts-actions">
              <button
                type="button"
                className="kk-parts-count"
                data-testid="parts-count"
                onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {found.length === 1 ? '1 kanji' : `${found.length} kanji`}
              </button>
              <button type="button" className="kk-btn small" onClick={() => select([])}>Clear</button>
            </div>
            {found.length > 0 && found.length <= MAX_QUICK && (
              <div className="kk-parts-quick" data-testid="parts-quick">
                {found.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="kk-parts-quick-kanji"
                    lang="ja"
                    aria-label={`${s.characters ?? ''} ${s.meanings.length > 0 ? (oneMeaning(s.meanings) ?? '') : ''}`.trim()}
                    data-testid={`parts-quick-${s.id}`}
                    onClick={() => navigate(paths.subject(s.id))}
                  >
                    {s.characters}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="kk-parts-grid" data-testid="parts-picker">
        {groups.map((g) => (
          <div key={g.strokes} className="kk-parts-group" role="group" aria-label={`${g.strokes} strokes`}>
            <span className="kk-parts-strokes" aria-hidden="true">{g.strokes}</span>
            {g.parts.map((p) => {
              const on = selectedSet.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  className={`kk-part${on ? ' selected' : ''}`}
                  lang="ja"
                  aria-pressed={on}
                  disabled={!on && !search.available.has(p)}
                  data-testid={`part-${p}`}
                  onClick={() => toggle(p)}
                >
                  {p}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {selected.length > 0 && (
        <section className="kk-parts-results">
          <h2 ref={resultsRef} className="kk-browse-heading" data-testid="parts-results-heading">
            {found.length === 0 ? 'No kanji has all of these parts.' : found.length === 1 ? '1 kanji found:' : `${found.length} kanji found:`}
          </h2>
          {shown.length > 0 && (
            <div className="kk-result-grid kk-parts-result-grid" data-testid="parts-results">
              {shown.map((s) => {
                const progress = cardProgressText(s, cardStage(s, systems), state.now);
                const subject = learner.content.byId.get(s.id);
                const reading = subject === undefined ? '' : oneReading(subject, katakana);
                return (
                  <div key={s.id} className="kk-card-cell">
                    <SubjectCard
                      object={s.object}
                      characters={<SubjectChars subject={s} />}
                      meaning={s.meanings.length > 0 ? oneMeaning(s.meanings) : null}
                      reading={reading === '' ? null : reading}
                      progress={progress}
                      testId={`result-${s.id}`}
                      onClick={() => navigate(paths.subject(s.id))}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {found.length > shown.length && (
            <p className="kk-parts-more">Showing the first {MAX_SHOWN}: pick more parts to narrow the rest down.</p>
          )}
        </section>
      )}
    </div>
  );
}
