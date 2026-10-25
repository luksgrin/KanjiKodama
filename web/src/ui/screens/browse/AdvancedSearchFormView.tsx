/**
 * The advanced search form (`views/AdvancedSearchFormView`, layout `advanced_search.xml`) over core
 * `AdvancedSearchForm`: its fields, switches and sort order in the layout's order and texts, a Search
 * button above and below. Refine passes the current search's parameters (`injectParameters`).
 *
 * Added for the JLPT curriculum: a "JLPT block" choice (JLPT order only) that fills the level range
 * with the block's levels.
 */
import { useId, useMemo, useRef, useState } from 'react';
import { blockName } from '../../../core/curriculum';
import { AdvancedSearchForm, SEARCH_SORT_ORDERS, SORT_ORDER_DESCRIPTIONS, type AdvancedSearchParameters, type FormSwitch, type SearchSortOrder, type TextField } from '../../../core/search';
import type { SrsSystem } from '../../../core/srs';
import { starsText } from '../../components/subject';

/** The switch labels of `advanced_search.xml` (the stage labels come from the form). */
const SWITCH_LABELS: Readonly<Record<string, string>> = {
  limitToLeeches: 'Only leeches:',
  starRating0: `${starsText(0)}:`,
  starRating1: `${starsText(1)}:`,
  starRating2: `${starsText(2)}:`,
  starRating3: `${starsText(3)}:`,
  starRating4: `${starsText(4)}:`,
  starRating5: `${starsText(5)}:`,
  itemTypeRadical: 'Radical:',
  itemTypeKanji: 'Kanji:',
  itemTypeVocabulary: 'Vocabulary:',
  itemTypeKanaVocabulary: 'Kana Vocabulary:',
  jlptLevelNone: 'None:',
  jlptLevelN5: 'N5:',
  jlptLevelN4: 'N4:',
  jlptLevelN3: 'N3:',
  jlptLevelN2: 'N2:',
  jlptLevelN1: 'N1:',
  joyoGradeNone: 'None:',
  joyoGrade1: '1:',
  joyoGrade2: '2:',
  joyoGrade3: '3:',
  joyoGrade4: '4:',
  joyoGrade5: '5:',
  joyoGrade6: '6:',
  joyoGrade7: 'Middle school:',
};

/** A JLPT block's level range in the current JLPT order (`blocks[level-1]` is the block code). */
export interface BlockRange {
  block: number;
  label: string;
  first: number;
  last: number;
}

/** The blocks of the JLPT order in level order ("N5": levels 1–5, …). */
export function blockRanges(blocks: readonly number[]): BlockRange[] {
  const out: BlockRange[] = [];
  blocks.forEach((b, i) => {
    const last = out[out.length - 1];
    if (last && last.block === b) last.last = i + 1;
    else out.push({ block: b, label: blockName(b), first: i + 1, last: i + 1 });
  });
  return out;
}

export interface AdvancedSearchFormViewProps {
  systems: readonly SrsSystem[];
  starRatingsEnabled: boolean;
  /** Fill the form from these (Refine). */
  initial?: AdvancedSearchParameters | null;
  /** The JLPT order's blocks; empty in WaniKani order (no block choice). */
  blocks?: readonly number[];
  onSearch: (parameters: AdvancedSearchParameters) => void;
  /** The two buttons' label (`setSearchButtonLabel`; the self-study screen: "Start"). */
  searchLabel?: string;
  /** Whether the sort order row shows (`setSortOrderVisibility`; hidden on the self-study screen). */
  showSortOrder?: boolean;
}

export function AdvancedSearchFormView({ systems, starRatingsEnabled, initial, blocks = [], onSearch, searchLabel = 'Search', showSortOrder = true }: AdvancedSearchFormViewProps) {
  const id = useId();
  const formRef = useRef<AdvancedSearchForm | null>(null);
  if (formRef.current === null) {
    const f = new AdvancedSearchForm(systems, starRatingsEnabled);
    if (initial) f.injectParameters(initial);
    formRef.current = f;
  }
  const form = formRef.current;
  const [, setVersion] = useState(0);
  const changed = (): void => setVersion((v) => v + 1);
  const ranges = useMemo(() => blockRanges(blocks), [blocks]);

  const text = (field: TextField, label: string) => (
    <input
      id={`${id}-${field}`}
      className="kk-search-number"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder={field === 'minLevel' || field === 'minFrequency' ? 'Min' : field === 'maxLevel' || field === 'maxFrequency' ? 'Max' : ''}
      value={form.texts[field]}
      onChange={(e) => {
        form.texts[field] = e.target.value;
        changed();
      }}
    />
  );

  const toggle = (sw: FormSwitch, label: string) => (
    <label key={sw.name} className="kk-search-switch">
      <span>{label}</span>
      <input
        type="checkbox"
        name={sw.name}
        checked={form.checked.has(sw.name)}
        onChange={(e) => {
          if (e.target.checked) form.checked.add(sw.name);
          else form.checked.delete(sw.name);
          changed();
        }}
      />
    </label>
  );

  const group = (prefix: string) =>
    form.switches.filter((sw) => sw.name.startsWith(prefix) && sw.visible).map((sw) => toggle(sw, sw.label ?? SWITCH_LABELS[sw.name] ?? sw.name));

  const search = () => onSearch(form.extractParameters());
  const leech = form.switches.find((s) => s.name === 'limitToLeeches');

  const chooseBlock = (value: string): void => {
    const r = ranges.find((x) => String(x.block) === value);
    if (!r) return;
    form.texts.minLevel = String(r.first);
    form.texts.maxLevel = String(r.last);
    changed();
  };
  const currentBlock = ranges.find((r) => form.texts.minLevel === String(r.first) && form.texts.maxLevel === String(r.last));

  return (
    <form
      className="kk-advanced-search"
      onSubmit={(e) => {
        e.preventDefault();
        search();
      }}
    >
      <button type="submit" className="kk-btn small">{searchLabel}</button>
      <div className="kk-search-grid">
        <span>Level range:</span>
        <span className="kk-search-range">{text('minLevel', 'Min level')} - {text('maxLevel', 'Max level')}</span>
        {ranges.length > 0 && (
          <>
            <label htmlFor={`${id}-block`}>JLPT block:</label>
            <select id={`${id}-block`} value={currentBlock ? String(currentBlock.block) : ''} onChange={(e) => chooseBlock(e.target.value)}>
              <option value="">Any</option>
              {ranges.map((r) => (
                <option key={r.block} value={String(r.block)}>
                  {r.label} (levels {r.first}–{r.last})
                </option>
              ))}
            </select>
          </>
        )}
        <span>Frequency range:</span>
        <span className="kk-search-range">{text('minFrequency', 'Min frequency')} - {text('maxFrequency', 'Max frequency')}</span>
        {leech && (
          <>
            <span>Only leeches:</span>
            <input
              type="checkbox"
              aria-label="Only leeches"
              checked={form.checked.has('limitToLeeches')}
              onChange={(e) => {
                if (e.target.checked) form.checked.add('limitToLeeches');
                else form.checked.delete('limitToLeeches');
                changed();
              }}
            />
          </>
        )}
        <span>Next review in less than:</span>
        <span>{text('reviewLessHours', 'Next review in less than (hours)')} hours</span>
        <span>Next review in more than:</span>
        <span>{text('reviewMoreHours', 'Next review in more than (hours)')} hours</span>
        <span>Incorrect answer less than:</span>
        <span>{text('incorrectHours', 'Incorrect answer less than (hours ago)')} hours ago</span>
        <span>Burned less than:</span>
        <span>{text('burnedLessDays', 'Burned less than (days ago)')} days ago</span>
        <span>Burned more than:</span>
        <span>{text('burnedMoreDays', 'Burned more than (days ago)')} days ago</span>
        {showSortOrder && (
          <>
            <label htmlFor={`${id}-sort`}>Sort order:</label>
            <select
              id={`${id}-sort`}
              value={form.sortOrder}
              onChange={(e) => {
                form.sortOrder = e.target.value as SearchSortOrder;
                changed();
              }}
            >
              {SEARCH_SORT_ORDERS.map((o) => (
                <option key={o} value={o}>{SORT_ORDER_DESCRIPTIONS[o]}</option>
              ))}
            </select>
          </>
        )}
      </div>
      {starRatingsEnabled && (
        <fieldset className="kk-search-group">
          <legend>Star rating:</legend>
          {group('starRating')}
        </fieldset>
      )}
      <fieldset className="kk-search-group">
        <legend>SRS stages:</legend>
        {group('srsStage')}
      </fieldset>
      <fieldset className="kk-search-group">
        <legend>Subject types:</legend>
        {group('itemType')}
      </fieldset>
      <fieldset className="kk-search-group">
        <legend>JLPT levels:</legend>
        {group('jlptLevel')}
      </fieldset>
      <fieldset className="kk-search-group">
        <legend>Jōyō kanji grades:</legend>
        {group('joyoGrade')}
      </fieldset>
      <button type="submit" className="kk-btn small">{searchLabel}</button>
    </form>
  );
}
