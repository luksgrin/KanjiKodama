/**
 * Text size and font (`text_size`, `ui_font`; ui/theme/appearance.ts): a preview line, then the five
 * sizes and the three fonts as radio lists. A pick is saved at once and the whole app follows (App.tsx
 * `ThemeSync`), the preview with it. Reads and writes the settings itself: Display settings → "Text size
 * and font" shows it, and the first-start onboarding can too.
 *
 * Each size is labelled at that size (100 % = 16 px, whatever is chosen now) and each font's name is
 * drawn in that font, so the lists show what a choice does before it is picked.
 */
import { useId, type CSSProperties } from 'react';
import { useApp, useAppState } from '../../hooks/useApp';
import {
  APPEARANCE_PREVIEW,
  TEXT_SIZE_KEY,
  TEXT_SIZES,
  UI_FONTS,
  UI_FONT_KEY,
  textSize,
  uiFont,
} from '../../theme/appearance';
import './appearance.css';

function Choice({ checked, label, detail, labelStyle, testId, onPick }: {
  checked: boolean; label: string; detail: string; labelStyle?: CSSProperties; testId: string; onPick(): void;
}) {
  return (
    <li>
      <button type="button" className="kk-appearance-choice" role="radio" aria-checked={checked} data-testid={testId} onClick={onPick}>
        <span className="kk-appearance-radio" aria-hidden="true" />
        <span className="kk-appearance-choice-text">
          <span className="kk-appearance-choice-label" style={labelStyle}>{label}</span>
          <span className="kk-appearance-choice-detail">{detail}</span>
        </span>
      </button>
    </li>
  );
}

export function AppearancePicker() {
  const app = useApp();
  const { prefs } = useAppState();
  const size = textSize(prefs);
  const font = uiFont(prefs);
  const [before, kanji, after] = APPEARANCE_PREVIEW.split(/(漢字)/);
  const id = useId();
  return (
    <section className="kk-appearance" data-testid="appearance-picker">
      <p className="kk-appearance-preview" data-testid="appearance-preview">
        {before}<span lang="ja">{kanji}</span>{after}
      </p>
      <h3 className="kk-appearance-heading" id={`${id}-size`}>Text size</h3>
      <ul className="kk-appearance-list" role="radiogroup" aria-labelledby={`${id}-size`}>
        {TEXT_SIZES.map(([value, label]) => (
          <Choice key={value} checked={value === size} label={label} detail={`${value} %`} testId={`text-size-${value}`}
            labelStyle={{ fontSize: `${(16 * Number(value)) / 100}px` }}
            onPick={() => { if (value !== size) void app.setPreference(TEXT_SIZE_KEY, value); }} />
        ))}
      </ul>
      <h3 className="kk-appearance-heading" id={`${id}-font`}>Font</h3>
      <ul className="kk-appearance-list" role="radiogroup" aria-labelledby={`${id}-font`}>
        {UI_FONTS.map((f) => (
          <Choice key={f.value} checked={f.value === font} label={f.name} detail={f.note} testId={`ui-font-${f.value}`}
            labelStyle={{ fontFamily: f.family }}
            onPick={() => { if (f.value !== font) void app.setPreference(UI_FONT_KEY, f.value); }} />
        ))}
      </ul>
    </section>
  );
}
