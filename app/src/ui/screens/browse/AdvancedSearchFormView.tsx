/**
 * The advanced search form (`views/AdvancedSearchFormView`, layout `advanced_search.xml`) over core
 * `AdvancedSearchForm`: its fields, switches and sort order in the layout's order and texts, a Search
 * button above and below. Refine passes the current search's parameters (`injectParameters`).
 */
import { Fragment, useId, useRef, useState, type ReactNode } from 'react';
import { useTableColumns } from './tableColumns';
import './browse.css';
import { AdvancedSearchForm, SEARCH_SORT_ORDERS, SORT_ORDER_DESCRIPTIONS, type AdvancedSearchParameters, type SearchSortOrder, type TextField } from '../../../core/search';
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

export interface AdvancedSearchFormViewProps {
  systems: readonly SrsSystem[];
  starRatingsEnabled: boolean;
  /** Fill the form from these (Refine). */
  initial?: AdvancedSearchParameters | null;
  onSearch: (parameters: AdvancedSearchParameters) => void;
  /** The two buttons' label (`setSearchButtonLabel`; the self-study screen: "Start"). */
  searchLabel?: string;
  /** Whether the sort order row shows (`setSortOrderVisibility`; hidden on the self-study screen). */
  showSortOrder?: boolean;
}

export function AdvancedSearchFormView({ systems, starRatingsEnabled, initial, onSearch, searchLabel = 'Search', showSortOrder = true }: AdvancedSearchFormViewProps) {
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
  const tableRef = useTableColumns<HTMLFormElement>();

  const text = (field: TextField, label: string, ems: 2 | 4) => (
    <input
      id={`${id}-${field}`}
      className={`kk-search-number ems${ems}`}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder={field === 'minLevel' || field === 'minFrequency' ? 'Min' : field === 'maxLevel' || field === 'maxFrequency' ? 'Max' : ''}
      value={form.texts[field]}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        form.texts[field] = e.target.value;
        changed();
      }}
    />
  );

  /** A SwitchCompat (WK.Switch.Normal) over a checkbox. */
  const switchControl = (name: string, label: string) => (
    <label className="kk-adv-switch">
      <input
        type="checkbox"
        role="switch"
        name={name}
        data-testid={`adv-switch-${name}`}
        aria-label={label.replace(/:$/, '')}
        checked={form.checked.has(name)}
        onChange={(e) => {
          if (e.target.checked) form.checked.add(name);
          else form.checked.delete(name);
          changed();
        }}
      />
      <span className="kk-adv-switch-track" aria-hidden="true"><span className="kk-adv-switch-thumb" /></span>
    </label>
  );

  /** A table row: label (column 1) and value (column 2). */
  const row = (label: ReactNode, value: ReactNode, key?: string) => (
    <Fragment key={key}>
      <span className="kk-adv-label">{label}</span>
      <span className="kk-adv-value">{value}</span>
    </Fragment>
  );

  /** A group header ("SRS stages:", 16 dp above) and its switch rows (labels right-aligned). */
  const group = (title: string, prefix: string) => (
    <>
      <span className="kk-adv-label kk-adv-group">{title}</span>
      {form.switches.filter((sw) => sw.name.startsWith(prefix) && sw.visible).map((sw) => {
        const label = sw.label ?? SWITCH_LABELS[sw.name] ?? sw.name;
        return (
          <Fragment key={sw.name}>
            <span className="kk-adv-label kk-adv-switch-label">{label}</span>
            <span className="kk-adv-value kk-adv-switch-cell">{switchControl(sw.name, label)}</span>
          </Fragment>
        );
      })}
    </>
  );

  const search = () => onSearch(form.extractParameters());
  const leech = form.switches.find((s) => s.name === 'limitToLeeches');
  const button = (top: boolean) => (
    <>
      <span className="kk-adv-label" />
      <span className={`kk-adv-value kk-adv-button${top ? '' : ' bottom'}`}><button type="submit" className="kk-btn">{searchLabel}</button></span>
    </>
  );

  return (
    <form
      className="kk-advanced-search"
      ref={tableRef}
      onSubmit={(e) => {
        e.preventDefault();
        search();
      }}
    >
      {button(true)}
      {row('Level range:', <span className="kk-search-range">{text('minLevel', 'Min level', 2)}<span className="kk-adv-dash">-</span>{text('maxLevel', 'Max level', 2)}</span>)}
      {row('Frequency range:', <span className="kk-search-range">{text('minFrequency', 'Min frequency', 4)}<span className="kk-adv-dash">-</span>{text('maxFrequency', 'Max frequency', 4)}</span>)}
      {leech && row('Only leeches:', switchControl('limitToLeeches', 'Only leeches:'))}
      {row('Next review in less than:', <span className="kk-search-range">{text('reviewLessHours', 'Next review in less than (hours)', 2)}<span>hours</span></span>)}
      {row('Next review in more than:', <span className="kk-search-range">{text('reviewMoreHours', 'Next review in more than (hours)', 2)}<span>hours</span></span>)}
      {row('Incorrect answer less than:', <span className="kk-search-range">{text('incorrectHours', 'Incorrect answer less than (hours ago)', 2)}<span>hours ago</span></span>)}
      {row('Burned less than:', <span className="kk-search-range">{text('burnedLessDays', 'Burned less than (days ago)', 2)}<span>days ago</span></span>)}
      {row('Burned more than:', <span className="kk-search-range">{text('burnedMoreDays', 'Burned more than (days ago)', 2)}<span>days ago</span></span>)}
      {showSortOrder && row(
        <label htmlFor={`${id}-sort`}>Sort order:</label>,
        <select
          id={`${id}-sort`}
          className="kk-adv-spinner"
          data-testid="adv-sort-order"
          value={form.sortOrder}
          onChange={(e) => {
            form.sortOrder = e.target.value as SearchSortOrder;
            changed();
          }}
        >
          {SEARCH_SORT_ORDERS.map((o) => (
            <option key={o} value={o}>{SORT_ORDER_DESCRIPTIONS[o]}</option>
          ))}
        </select>,
      )}
      {starRatingsEnabled && group('Star rating:', 'starRating')}
      {group('SRS stages:', 'srsStage')}
      {group('Subject types:', 'itemType')}
      {group('JLPT levels:', 'jlptLevel')}
      {group('Jōyō kanji grades:', 'joyoGrade')}
      {button(false)}
    </form>
  );
}
