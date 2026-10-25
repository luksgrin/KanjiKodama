/**
 * Renders `schema.ts` rows as AndroidX preference rows (`PreferenceFragmentCompat`): a full-width
 * tappable row with the title and the summary, the icon space reserved at the left (72 dp), and
 *
 * - SwitchPreferenceCompat: a Material switch at the right; tapping the row toggles it;
 * - ListPreference: the chosen entry as summary; tap → a single-choice dialog (title, radio list,
 *   Cancel) that closes on a pick;
 * - EditTextPreference: the value as summary; tap → a dialog with a text field, Cancel / OK
 *   (EditLimitedIntPreference: out of range → the Java toast, nothing stored);
 * - SeekBarPreference: the seek bar and its value under the title, saved when released;
 * - NumberRangePreference: "Min 3", "1 - 5", "Unlimited"; tap → the Min / Max dialog.
 *
 * Changes go through `app.setPreference` (same keys and value types as Java's `SharedPreferences`).
 * Turning on `enable_advanced` asks first, like `PreferencesFragment`.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { THEME_PREF_KEY, applyTheme, parseThemeChoice } from '../../../app/theme';
import { advancedEnabled, javaParseInt, type Preferences, type PreferenceValue } from '../../../core/settings';
import { rescheduleReviewNotifications } from '../../../platform/reviewNotifications';
import { useApp, useReady } from '../../hooks/useApp';
import { toast } from '../../shell/toast';
import { AlertDialog, ChoiceList } from './AlertDialog';
import {
  ENABLE_ADVANCED_WARNING,
  NUMBER_RANGE_MESSAGE,
  rangeSummary,
  rangeValue,
  shownValue,
  visibleRows,
  type ActionRow,
  type BoolSetting,
  type ListSetting,
  type RangeSetting,
  type Row,
  type SettingGroup,
  type SliderSetting,
  type TextSetting,
} from './schema';

export type Write = (key: string, value: PreferenceValue) => void;
export type Actions = Readonly<Record<string, () => void>>;

/** One tappable preference row. */
export function PrefRow({ title, summary, onClick, testId, disabled = false, widget, role, checked }: {
  title: ReactNode; summary?: ReactNode; onClick?(): void; testId?: string; disabled?: boolean; widget?: ReactNode;
  role?: 'switch'; checked?: boolean;
}) {
  return (
    <li>
      <button type="button" className="kk-pref" data-testid={testId} disabled={disabled} onClick={onClick}
        role={role} aria-checked={role === 'switch' ? checked : undefined}>
        <span className="kk-pref-text">
          <span className="kk-pref-title">{title}</span>
          {summary !== undefined && summary !== '' && <span className="kk-pref-summary">{summary}</span>}
        </span>
        {widget}
      </button>
    </li>
  );
}

/** `PreferenceCategory`: the accent-coloured title, a divider above (but not above the first). */
export function PrefCategory({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <li className="kk-pref-category" data-testid={testId}>
      <h2 className="kk-pref-category-title">{title}</h2>
      <ul className="kk-prefs">{children}</ul>
    </li>
  );
}

function BoolRow({ def, prefs, disabled, write }: { def: BoolSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const checked = shownValue(def, prefs);
  return (
    <PrefRow title={def.title} summary={def.summary} testId={`setting-${def.key}`} disabled={disabled}
      role="switch" checked={checked} onClick={() => write(def.key, !checked)}
      widget={<span className={`kk-switch${checked ? ' on' : ''}`} aria-hidden="true"><span className="kk-switch-thumb" /></span>} />
  );
}

function ListRow({ def, prefs, disabled, write }: { def: ListSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const [open, setOpen] = useState(false);
  const raw = shownValue(def, prefs);
  const value = def.key === THEME_PREF_KEY ? parseThemeChoice(prefs[def.key]) : raw;
  const entry = def.options.find(([v]) => v === value)?.[1];
  return (
    <>
      <PrefRow title={def.title} summary={def.summary ?? entry ?? ''} testId={`setting-${def.key}`} disabled={disabled} onClick={() => setOpen(true)} />
      <AlertDialog open={open} title={def.title} onCancel={() => setOpen(false)} testId={`dialog-${def.key}`}
        negative={{ label: 'Cancel', onClick: () => setOpen(false) }}>
        <ChoiceList label={def.title} checked={entry === undefined ? null : value}
          items={def.options.map(([v, label]) => ({ key: v, label, testId: `choice-${def.key}-${v}` }))}
          onPick={(v) => { setOpen(false); if (v !== value) write(def.key, v); }} />
      </AlertDialog>
    </>
  );
}

/** The field of an EditText / range dialog: number keyboard, focused when the dialog opens. */
function DialogField({ fieldRef, initial, label, placeholder, small }: {
  fieldRef: RefObject<HTMLInputElement | null>; initial: string; label: string; placeholder?: string; small?: boolean;
}) {
  useEffect(() => {
    const f = fieldRef.current;
    if (!f) return;
    f.focus();
    const n = f.value.length;
    try { f.setSelectionRange(n, n); } catch { /* not a text field */ }
  }, [fieldRef]);
  return (
    <input ref={fieldRef} className={`kk-alert-field${small ? ' small' : ''}`} type="text" inputMode="numeric" defaultValue={initial}
      aria-label={label} placeholder={placeholder} autoComplete="off" />
  );
}

/** EditTextPreference with a number keyboard (`setNumberInputType`); EditLimitedIntPreference checks the range. */
function TextRow({ def, prefs, disabled, write }: { def: TextSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const stored = shownValue(def, prefs);
  const ok = () => {
    const draft = ref.current?.value ?? stored;
    setOpen(false);
    if (def.min !== undefined || def.max !== undefined) {
      const n = javaParseInt(draft);
      if (n === null) { toast('Invalid Number'); return; }
      if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) {
        toast(`Please use a number between ${def.min ?? ''} and ${def.max ?? ''}`, { long: true });
        return;
      }
    }
    if (draft !== stored) write(def.key, draft);
  };
  return (
    <>
      <PrefRow title={def.title} summary={def.summary ?? stored} testId={`setting-${def.key}`} disabled={disabled} onClick={() => setOpen(true)} />
      <AlertDialog open={open} title={def.title} onCancel={() => setOpen(false)} testId={`dialog-${def.key}`}
        negative={{ label: 'Cancel', onClick: () => setOpen(false) }} positive={{ label: 'OK', onClick: ok }}>
        <form className="kk-alert-form" onSubmit={(e) => { e.preventDefault(); ok(); }}>
          <DialogField fieldRef={ref} initial={stored} label={def.title} />
        </form>
      </AlertDialog>
    </>
  );
}

/** SeekBarPreference (`showSeekBarValue`): the bar under the title, the value at its right; saved when released. */
function SliderRow({ def, prefs, disabled, write }: { def: SliderSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const stored = shownValue(def, prefs);
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);
  const commit = () => { if (draft !== stored) write(def.key, draft); };
  return (
    <li>
      <div className={`kk-pref kk-pref-seekbar${disabled ? ' is-disabled' : ''}`} data-testid={`setting-${def.key}`}>
        <span className="kk-pref-text">
          <span className="kk-pref-title">{def.title}</span>
          {def.summary !== undefined && <span className="kk-pref-summary">{def.summary}</span>}
          <span className="kk-seekbar-row">
            <input className="kk-seekbar" type="range" min={def.min} max={def.max} step={1} value={draft} disabled={disabled}
              aria-label={def.title} onChange={(e) => setDraft(Number(e.currentTarget.value))}
              onPointerUp={commit} onKeyUp={commit} onBlur={commit} onTouchEnd={commit} />
            <span className="kk-seekbar-value">{draft}</span>
          </span>
        </span>
      </div>
    </li>
  );
}

/** NumberRangePreference and its dialog: empty field = no rule (-1); a non-number leaves that value unchanged. */
function RangeRow({ def, prefs, disabled, write }: { def: RangeSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const [open, setOpen] = useState(false);
  const minRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);
  const { min, max } = rangeValue(prefs, def.key);
  const text = (n: number) => (n === -1 ? '' : String(n));
  const ok = () => {
    setOpen(false);
    const apply = (which: 'min' | 'max', field: HTMLInputElement | null, stored: number) => {
      const t = (field?.value ?? text(stored)).trim();
      // Integer.parseInt failing leaves the value unchanged (the dialog's safe()).
      const n = t === '' ? -1 : javaParseInt(t);
      if (n === null || n < -1) return;
      if (n !== stored) write(`${def.key}_${which}`, n);
    };
    apply('min', minRef.current, min);
    apply('max', maxRef.current, max);
  };
  return (
    <>
      <PrefRow title={def.title} summary={rangeSummary(min, max)} testId={`setting-${def.key}`} disabled={disabled} onClick={() => setOpen(true)} />
      <AlertDialog open={open} title={def.title} onCancel={() => setOpen(false)} testId={`dialog-${def.key}`}
        negative={{ label: 'Cancel', onClick: () => setOpen(false) }} positive={{ label: 'OK', onClick: ok }}>
        <form className="kk-alert-form" onSubmit={(e) => { e.preventDefault(); ok(); }}>
          <p className="kk-alert-message">{NUMBER_RANGE_MESSAGE}</p>
          <span className="kk-range-fields">
            <DialogField fieldRef={minRef} initial={text(min)} label={`${def.title} min`} placeholder="Min" small />
            <span aria-hidden="true">-</span>
            <input ref={maxRef} className="kk-alert-field small" type="text" inputMode="numeric" defaultValue={text(max)}
              aria-label={`${def.title} max`} placeholder="Max" autoComplete="off" />
          </span>
          <button type="submit" hidden />
        </form>
      </AlertDialog>
    </>
  );
}

function ActionRowView({ row, actions }: { row: ActionRow; actions: Actions }) {
  const run = actions[row.key];
  if (!run) return null;
  return <PrefRow title={row.title} summary={row.summary} testId={`setting-${row.key}`} onClick={run} />;
}

export function SettingRow({ row, prefs, write, actions = {} }: { row: Row; prefs: Preferences; write: Write; actions?: Actions }) {
  if (row.type === 'info') {
    return <li><p className="kk-pref kk-pref-info" data-testid={`setting-${row.key}`}><span className="kk-pref-text"><span className="kk-pref-title">{row.text}</span></span></p></li>;
  }
  if (row.type === 'action') return <ActionRowView row={row} actions={actions} />;
  const disabled = row.enabledWhen !== undefined && !row.enabledWhen(prefs);
  switch (row.type) {
    case 'bool': return <BoolRow def={row} prefs={prefs} disabled={disabled} write={write} />;
    case 'list': return <ListRow def={row} prefs={prefs} disabled={disabled} write={write} />;
    case 'text': return <TextRow def={row} prefs={prefs} disabled={disabled} write={write} />;
    case 'slider': return <SliderRow def={row} prefs={prefs} disabled={disabled} write={write} />;
    case 'range': return <RangeRow def={row} prefs={prefs} disabled={disabled} write={write} />;
  }
}

/**
 * The write path for settings rows: `setPreference`, the theme, the `enable_advanced` confirmation
 * and the notification reschedule after `enable_notifications` changes. Render `dialog` once.
 */
export function useSettingWriter(): { write: Write; dialog: ReactNode } {
  const app = useApp();
  const { state, platform, learner } = useReady();
  const [askAdvanced, setAskAdvanced] = useState(false);
  const write: Write = (key, value) => {
    if (key === 'enable_advanced' && value === true && !advancedEnabled(state.prefs)) {
      setAskAdvanced(true);
      return;
    }
    if (key === THEME_PREF_KEY) applyTheme(parseThemeChoice(value));
    void app.setPreference(key, value).then(() => {
      if (key === 'enable_notifications') {
        void rescheduleReviewNotifications(platform.notifications, learner, app.get().prefs, app.clock.now()).catch(() => undefined);
      }
    });
  };
  const answer = (yes: boolean) => { setAskAdvanced(false); void app.setPreference('enable_advanced', yes); };
  const dialog = (
    <AlertDialog open={askAdvanced} warning title="Enable advanced settings?" testId="dialog-enable-advanced"
      onCancel={() => setAskAdvanced(false)}
      negative={{ label: 'No', onClick: () => answer(false) }} positive={{ label: 'Yes', onClick: () => answer(true) }}>
      {/* Java renders the message as HTML: the same text with its two bold parts. */}
      <p className="kk-alert-message">
        <b>Warning:</b>{ENABLE_ADVANCED_WARNING.slice('Warning:'.length, ENABLE_ADVANCED_WARNING.indexOf('only change'))}
        <b>only change these settings if you are an experienced user</b>
        {ENABLE_ADVANCED_WARNING.slice(ENABLE_ADVANCED_WARNING.indexOf(' and know'))}
      </p>
    </AlertDialog>
  );
  return { write, dialog };
}

/** A sub-screen's rows. */
export function SettingGroupRows({ group, write, actions }: { group: SettingGroup; write: Write; actions?: Actions }) {
  const { state, platform } = useReady();
  const rows = visibleRows(group, { capabilities: platform.capabilities, mode: state.mode });
  return (
    <ul className="kk-prefs" data-testid={`group-${group.id}`}>
      {rows.map((r) => <SettingRow key={r.key} row={r} prefs={state.prefs} write={write} actions={actions} />)}
    </ul>
  );
}
