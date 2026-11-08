/**
 * Font settings → "Select fonts for quiz questions" and "Import fonts for quiz questions", shown as
 * `/settings?screen=font_selection` / `font_import` with their titles.
 *
 * Selection: the intro text, then one row per font (the eight built-in ones, then the imported
 * ones): its name (20 sp), "日本語の書体" in that font (34 sp) and a switch that adds / removes it
 * from `selected_fonts`. Import: the hint, IMPORT (a file picker: the system document picker in the
 * Android app, the browser's file dialog on the web), and a row per imported file with SAMPLE and
 * DELETE (borderless), with dialogs and toasts.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useApp, useReady } from '../../hooks/useApp';
import { toast } from '../../shell/toast';
import {
  BUILT_IN_FONTS,
  deleteImportedFont,
  hasImportedFont,
  importFont,
  importedFontNames,
  loadQuizFont,
  selectedFonts,
  SELECTED_FONTS_KEY,
  withFontSelected,
  type QuizFont,
} from '../../theme/quizFonts';
import { useAlerts } from './useAlerts';
import './fonts.css';

export const FONT_SELECTION_SCREEN = 'font_selection';
export const FONT_IMPORT_SCREEN = 'font_import';
/** The activities' `android:label`. */
export const FONT_SCREEN_TITLES: Readonly<Record<string, string>> = {
  [FONT_SELECTION_SCREEN]: 'Font selection',
  [FONT_IMPORT_SCREEN]: 'Font import',
};

export const FONT_SAMPLE = '日本語の書体';

/** The font's family once it loaded (null: the default face, or not loaded). */
function useFontFamily(id: string): QuizFont | null | undefined {
  const [font, setFont] = useState<QuizFont | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadQuizFont(id).then((f) => { if (live) setFont(f); });
    return () => { live = false; };
  }, [id]);
  return font;
}

function familyStyle(font: QuizFont | null | undefined): CSSProperties | undefined {
  return font?.family ? { fontFamily: `'${font.family}', var(--font-ja)` } : undefined;
}

function FontRow({ id, name, checked, onToggle, imported = false }: {
  id: string; name: string; checked: boolean; onToggle(on: boolean): void; imported?: boolean;
}) {
  const font = useFontFamily(id);
  // `addDynamicRow`: an imported font that doesn't load is not listed (the built-in rows always are).
  if (font === null && imported) return null;
  return (
    <li className="kk-font-row" data-testid={`font-row-${id}`}>
      <span className="kk-font-name">{name}</span>
      <span className={`kk-font-sample${font?.family ? '' : ' default'}`} lang="ja" style={familyStyle(font)}>{FONT_SAMPLE}</span>
      <button type="button" className="kk-font-switch" role="switch" aria-checked={checked} aria-label={name}
        data-testid={`font-switch-${id}`} onClick={() => onToggle(!checked)}>
        <span className={`kk-switch${checked ? ' on' : ''}`} aria-hidden="true"><span className="kk-switch-thumb" /></span>
      </button>
    </li>
  );
}

export function FontSelectionPage() {
  const app = useApp();
  const { state } = useReady();
  const [imported, setImported] = useState<string[]>([]);
  useEffect(() => { void importedFontNames().then(setImported); }, []);
  const selected = selectedFonts(state.prefs);
  const toggle = (id: string, on: boolean) => {
    void app.setPreference(SELECTED_FONTS_KEY, withFontSelected(app.get().prefs, id, on));
  };
  return (
    <div className="kk-font-page" data-testid="font-selection">
      <p className="kk-font-intro">These fonts are used in lessons and reviews. If you choose multiple fonts, one will be chosen at random for each item.</p>
      <ul className="kk-font-list">
        {BUILT_IN_FONTS.map((f) => (
          <FontRow key={f.id} id={f.id} name={f.name} checked={selected.includes(f.id)} onToggle={(on) => toggle(f.id, on)} />
        ))}
        {imported.map((n) => (
          <FontRow key={`i:${n}`} id={n} name={n} imported checked={selected.includes(n)} onToggle={(on) => toggle(n, on)} />
        ))}
      </ul>
    </div>
  );
}

/** The last path segment of the picked file's name. */
export function fontFileName(name: string): string | null {
  const p = name.lastIndexOf('/');
  const n = p >= 0 ? name.slice(p + 1) : name;
  return n === '' ? null : n;
}

export function FontImportPage() {
  const alerts = useAlerts();
  const [names, setNames] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => { void importedFontNames().then(setNames); };
  useEffect(refresh, []);

  const store = async (file: File, name: string) => {
    try {
      await importFont(name, await file.arrayBuffer());
    } catch {
      return;
    }
    refresh();
    toast('File imported', { long: true });
  };

  const picked = async (file: File | undefined) => {
    if (!file) return;
    const name = fontFileName(file.name);
    if (name === null) return;
    if (await hasImportedFont(name)) {
      alerts.show({
        title: 'Overwrite file?',
        warning: true,
        message: `A file named '${name}' already exists. Do you want to overwrite it?`,
        testId: 'dialog-overwrite-font',
        onCancel: alerts.close,
        negative: { label: 'No', onClick: alerts.close },
        positive: { label: 'Yes', onClick: () => { alerts.close(); void store(file, name); } },
      });
    } else {
      await store(file, name);
    }
  };

  const sample = async (name: string) => {
    const font = await loadQuizFont(name);
    if (font === null || font.family === null) {
      alerts.show({
        title: 'Unable to load font',
        message: 'There was an error attempting to load this font. You will not be able to use it in quizzes.',
        cancelable: false,
        testId: 'dialog-font-error',
        positive: { label: 'OK', onClick: alerts.close },
      });
      return;
    }
    alerts.show({
      title: 'Font sample',
      cancelable: false,
      testId: 'dialog-font-sample',
      children: <p className="kk-font-sample-dialog" lang="ja" style={familyStyle(font)}>{FONT_SAMPLE}</p>,
      positive: { label: 'OK', onClick: alerts.close },
    });
  };

  const remove = (name: string) => alerts.show({
    title: 'Delete file?',
    warning: true,
    message: `Are you sure you want to delete '${name}'`,
    testId: 'dialog-delete-font',
    onCancel: alerts.close,
    negative: { label: 'No', onClick: alerts.close },
    positive: {
      label: 'Yes',
      onClick: () => { alerts.close(); void deleteImportedFont(name).then(refresh, refresh); },
    },
  });

  return (
    <div className="kk-font-page kk-font-import" data-testid="font-import">
      <p className="kk-font-hint">Click import to select a TTF font file to import.</p>
      <button type="button" className="kk-btn" data-testid="import-font" onClick={() => input.current?.click()}>Import</button>
      <input ref={input} type="file" hidden data-testid="import-font-input"
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void picked(f); }} />
      <table className="kk-font-table">
        <tbody>
          {names.map((n) => (
            <tr key={n} data-testid={`imported-font-${n}`}>
              <td className="kk-font-file">{n}</td>
              <td><button type="button" className="kk-borderless" onClick={() => void sample(n)}>Sample</button></td>
              <td><button type="button" className="kk-borderless" onClick={() => remove(n)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {alerts.node}
    </div>
  );
}
