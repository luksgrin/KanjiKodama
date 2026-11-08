/**
 * Theme customization: a black
 * panel with the 33 customisable colours of the current theme in five labelled rows (subject types,
 * SRS stages, Apprentice/Guru subsections, level progression subsections, Anki mode colours), the
 * selected one in a dashed frame and described under the rows; then Reset (top left), "RGB values:"
 * (top right) and the HSL colour picker with its preview circle.
 *
 * Dragging the picker recolours the selection; letting go saves all 33 values
 * (`theme_customizations_<THEME>`, a JSON int list, 0 = the theme's own colour). Reset sets the
 * selection back to 0. The theme is the one in use right now (light or dark system mode); the app
 * applies the customised colours at once (App.tsx `ThemeSync`).
 */
import { useRef, useState } from 'react';
import { useApp, useReady } from '../../hooks/useApp';
import { useToolbar } from '../../shell/toolbar';
import {
  activeTheme,
  baseColor,
  customizationKey,
  hexToInt,
  intToHex,
  parseCustomizations,
  serializeCustomizations,
  themePrefsFrom,
} from '../../theme/themes';
import { HslColorPicker } from './HslColorPicker';
import './themeCustomization.css';

const EXTRA1 = '\nUsed on the timeline chart, the SRS breakdown, and the Post-60 progression bar';
const EXTRA2 = '\nUsed on the Post-60 progression bar with subsections enabled';
const EXTRA3 = '\nUsed on the Level progression chart';

/** `selectionDescriptions`. */
export const SELECTION_DESCRIPTIONS: readonly string[] = [
  'The identifying colour for Radical subjects',
  'The identifying colour for Kanji subjects',
  'The identifying colour for Vocabulary subjects',
  'The identifying colour for Kana Vocabulary subjects',
  'The segment colour for Locked items' + EXTRA1,
  'The segment colour for Initiate items (not started yet)' + EXTRA1,
  'The segment colour for Apprentice items' + EXTRA1,
  'The segment colour for Guru items' + EXTRA1,
  'The segment colour for Master items' + EXTRA1,
  'The segment colour for Enlightened items' + EXTRA1,
  'The segment colour for Burned items' + EXTRA1,
  'The segment colour for Apprentice I items' + EXTRA2,
  'The segment colour for Apprentice II items' + EXTRA2,
  'The segment colour for Apprentice III items' + EXTRA2,
  'The segment colour for Apprentice IV items' + EXTRA2,
  'The segment colour for Guru I items' + EXTRA2,
  'The segment colour for Guru II items' + EXTRA2,
  'The segment colour for Passed items' + EXTRA3,
  'The segment colour for stage 7 (Apprentice IV)' + EXTRA3,
  'The segment colour for stage 6' + EXTRA3,
  'The segment colour for stage 5 (Apprentice III)' + EXTRA3,
  'The segment colour for stage 4' + EXTRA3,
  'The segment colour for stage 3 (Apprentice II)' + EXTRA3,
  'The segment colour for stage 2' + EXTRA3,
  'The segment colour for stage 1 (Apprentice I)' + EXTRA3,
  'The segment colour for Initiate items' + EXTRA3,
  'The segment colour for Locked items' + EXTRA3,
  'The background colour for the Anki mode "Show Answer" button',
  'The background colour for the Anki mode "Next" button',
  'The background colour for the Anki mode "Correct" button',
  'The background colour for the Anki mode "Incorrect" button',
  'The text colour for the Anki mode buttons and answer text',
  'The background colour for the Anki mode answer text',
];

const ROWS: readonly { label: string; from: number; to: number }[] = [
  { label: 'Subject Types', from: 0, to: 4 },
  { label: 'SRS stages:', from: 4, to: 11 },
  { label: 'Apprentice and Guru subsections:', from: 11, to: 17 },
  { label: 'Level progression subsections:', from: 17, to: 27 },
  { label: 'Anki mode colours:', from: 27, to: 33 },
];

export function ThemeCustomizationScreen() {
  const app = useApp();
  const { state } = useReady();
  useToolbar({ title: 'Theme customization' });
  const theme = activeTheme(themePrefsFrom(state.prefs));
  const key = customizationKey(theme.id);
  const [chosen, setChosen] = useState<number[]>(() => parseCustomizations(state.prefs[key]));
  const [selection, setSelection] = useState(0);
  const latest = useRef(chosen);
  latest.current = chosen;

  const actual = (i: number): string => (chosen[i] ? intToHex(chosen[i]!) : baseColor(theme, i));
  const save = (colors: readonly number[]) => void app.setPreference(key, serializeCustomizations(colors));
  const setColor = (i: number, value: number): number[] => {
    const next = chosen.slice();
    next[i] = value;
    latest.current = next;
    setChosen(next);
    return next;
  };

  const sample = (i: number) => {
    const c = chosen[i] ?? 0;
    const style = i < 4
      ? {
        color: theme.ident || c === 0 ? theme.subjectText[i] : intToHex(c),
        background: !theme.ident || c === 0 ? theme.subjectBackground[i] : intToHex(c),
      }
      : { background: actual(i) };
    return (
      <div key={i} className={`kk-tc-cell${i < 4 ? ' subject' : ''}${selection === i ? ' selected' : ''}`}>
        <button type="button" className="kk-tc-sample" style={style} data-testid={`tc-sample-${i}`}
          aria-label={SELECTION_DESCRIPTIONS[i]!.split('\n')[0]} aria-pressed={selection === i} onClick={() => setSelection(i)}>
          {i < 4 ? <span lang="ja">亀</span> : null}
        </button>
      </div>
    );
  };

  const current = actual(selection);
  return (
    <div className="kk-tc" data-testid="theme-customization">
      <div className="kk-tc-panel">
        {ROWS.map((row) => (
          <div key={row.label}>
            <p className="kk-tc-label">{row.label}</p>
            <div className="kk-tc-row">{Array.from({ length: row.to - row.from }, (_, k) => sample(row.from + k))}</div>
          </div>
        ))}
        <p className="kk-tc-description" data-testid="tc-description">{SELECTION_DESCRIPTIONS[selection]}</p>
      </div>
      <div className="kk-tc-picker">
        <button type="button" className="kk-tc-reset" data-testid="tc-reset" disabled={!chosen[selection]}
          onClick={() => save(setColor(selection, 0))}>Reset</button>
        <p className="kk-tc-rgb" data-testid="tc-rgb">RGB values:<br />{current.toUpperCase()}</p>
        <HslColorPicker color={current} label={SELECTION_DESCRIPTIONS[selection]!.split('\n')[0]!}
          onChange={(hex) => setColor(selection, hexToInt(hex))}
          onChangeEnd={() => save(latest.current)} />
      </div>
    </div>
  );
}
