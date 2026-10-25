/**
 * Renders `schema.ts` groups as `.kk-panel`s of `.kk-row`s, one control per row type, and writes
 * changes with `app.setPreference` (same keys and value types as the Java `SharedPreferences`).
 * Turning on `enable_advanced` asks first, like `PreferencesFragment`.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { advancedEnabled, javaParseInt, type Preferences, type PreferenceValue } from '../../../core/settings';
import { rescheduleReviewNotifications } from '../../../platform/reviewNotifications';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Panel';
import { useApp, useReady } from '../../hooks/useApp';
import {
  ENABLE_ADVANCED_WARNING,
  NUMBER_RANGE_MESSAGE,
  rangeSummary,
  rangeValue,
  shownValue,
  visibleRows,
  type BoolSetting,
  type ListSetting,
  type RangeSetting,
  type Row,
  type SettingDef,
  type SettingGroup,
  type SliderSetting,
  type TextSetting,
} from './schema';

type Write = (key: string, value: PreferenceValue) => void;

function RowShell({ title, summary, children, testId, disabled, htmlFor }: {
  title: string; summary?: ReactNode; children: ReactNode; testId: string; disabled: boolean; htmlFor?: string;
}) {
  return (
    <li>
      <div className={`kk-row kk-setting${disabled ? ' is-disabled' : ''}`} data-testid={testId}>
        <span className="kk-row-main">
          {htmlFor ? <label className="kk-row-title" htmlFor={htmlFor}>{title}</label> : <span className="kk-row-title">{title}</span>}
          {summary !== undefined && summary !== '' && <span className="kk-row-sub">{summary}</span>}
        </span>
        {children}
      </div>
    </li>
  );
}

function BoolRow({ def, prefs, disabled, write }: { def: BoolSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const id = useId();
  const checked = shownValue(def, prefs);
  return (
    <RowShell title={def.title} summary={def.summary} testId={`setting-${def.key}`} disabled={disabled} htmlFor={id}>
      <input id={id} type="checkbox" role="switch" className="kk-switch" checked={checked} disabled={disabled}
        onChange={(e) => write(def.key, e.currentTarget.checked)} />
    </RowShell>
  );
}

function ListRow({ def, prefs, disabled, write }: { def: ListSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const id = useId();
  const value = shownValue(def, prefs);
  const known = def.options.some(([v]) => v === value);
  return (
    <RowShell title={def.title} summary={def.summary} testId={`setting-${def.key}`} disabled={disabled} htmlFor={id}>
      <select id={id} className="kk-select" value={known ? value : def.default} disabled={disabled}
        onChange={(e) => write(def.key, e.currentTarget.value)}>
        {def.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    </RowShell>
  );
}

/** EditTextPreference (number keyboard), saved on blur or Enter. EditLimitedIntPreference rejects out-of-range values. */
function TextRow({ def, prefs, disabled, write }: { def: TextSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const id = useId();
  const stored = shownValue(def, prefs);
  const [draft, setDraft] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(stored), [stored]);
  const commit = () => {
    if (draft === stored) return;
    if (def.min !== undefined || def.max !== undefined) {
      const n = javaParseInt(draft);
      if (n === null || (def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) {
        setError(`Enter a whole number from ${def.min ?? ''} to ${def.max ?? ''}.`);
        setDraft(stored);
        return;
      }
    }
    setError(null);
    write(def.key, draft);
  };
  return (
    <RowShell title={def.title} summary={error ?? (def.summary ?? stored)} testId={`setting-${def.key}`} disabled={disabled} htmlFor={id}>
      <input id={id} className="kk-input kk-input-number" type="text" inputMode="numeric" value={draft} disabled={disabled}
        onChange={(e) => setDraft(e.currentTarget.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </RowShell>
  );
}

/** SeekBarPreference with its value shown; saved when the thumb is released. */
function SliderRow({ def, prefs, disabled, write }: { def: SliderSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const id = useId();
  const stored = shownValue(def, prefs);
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);
  const commit = () => { if (draft !== stored) write(def.key, draft); };
  return (
    <RowShell title={def.title} summary={String(draft)} testId={`setting-${def.key}`} disabled={disabled} htmlFor={id}>
      <input id={id} className="kk-slider" type="range" min={def.min} max={def.max} step={1} value={draft} disabled={disabled}
        onChange={(e) => setDraft(Number(e.currentTarget.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </RowShell>
  );
}

/** NumberRangePreference: Min and Max fields, empty = no rule (-1). */
function RangeRow({ def, prefs, disabled, write }: { def: RangeSetting; prefs: Preferences; disabled: boolean; write: Write }) {
  const { min, max } = rangeValue(prefs, def.key);
  const text = (n: number) => (n === -1 ? '' : String(n));
  const [draft, setDraft] = useState({ min: text(min), max: text(max) });
  useEffect(() => setDraft({ min: text(min), max: text(max) }), [min, max]);
  const commit = (which: 'min' | 'max') => {
    const t = draft[which].trim();
    const stored = which === 'min' ? min : max;
    // Integer.parseInt failing leaves the value unchanged (the dialog's safe()).
    const n = t === '' ? -1 : javaParseInt(t);
    if (n === null || n < -1) { setDraft((d) => ({ ...d, [which]: text(stored) })); return; }
    if (n !== stored) write(`${def.key}_${which}`, n);
  };
  const field = (which: 'min' | 'max', label: string) => (
    <input className="kk-input kk-input-number" type="text" inputMode="numeric" placeholder={label} aria-label={`${def.title} ${label.toLowerCase()}`}
      value={draft[which]} disabled={disabled}
      onChange={(e) => { const v = e.currentTarget.value; setDraft((d) => ({ ...d, [which]: v })); }}
      onBlur={() => commit(which)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
  return (
    <RowShell title={def.title} summary={rangeSummary(min, max)} testId={`setting-${def.key}`} disabled={disabled}>
      <span className="kk-range" title={NUMBER_RANGE_MESSAGE}>{field('min', 'Min')}<span aria-hidden>-</span>{field('max', 'Max')}</span>
    </RowShell>
  );
}

function SettingRow({ row, prefs, write, gateAdvanced }: { row: Row; prefs: Preferences; write: Write; gateAdvanced: boolean }) {
  if (row.type === 'info') return <li><p className="kk-small kk-muted kk-setting-info" data-testid={`setting-${row.key}`}>{row.text}</p></li>;
  if (row.type === 'heading') return <li><h3 className="kk-setting-heading">{row.text}</h3></li>;
  const def: SettingDef = row;
  const disabled = (def.enabledWhen !== undefined && !def.enabledWhen(prefs)) || (gateAdvanced && def.advanced === true && !advancedEnabled(prefs));
  switch (def.type) {
    case 'bool': return <BoolRow def={def} prefs={prefs} disabled={disabled} write={write} />;
    case 'list': return <ListRow def={def} prefs={prefs} disabled={disabled} write={write} />;
    case 'text': return <TextRow def={def} prefs={prefs} disabled={disabled} write={write} />;
    case 'slider': return <SliderRow def={def} prefs={prefs} disabled={disabled} write={write} />;
    case 'range': return <RangeRow def={def} prefs={prefs} disabled={disabled} write={write} />;
  }
}

/**
 * The write path for settings rows: `setPreference`, the `enable_advanced` confirmation and the
 * notification reschedule after `enable_notifications` changes. Render `dialog` once.
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
    void app.setPreference(key, value).then(() => {
      if (key === 'enable_notifications') {
        void rescheduleReviewNotifications(platform.notifications, learner, app.get().prefs, app.clock.now()).catch(() => undefined);
      }
    });
  };
  const dialog = (
    <ConfirmDialog open={askAdvanced} title="Enable advanced settings?" confirmLabel="Yes" cancelLabel="No"
      onConfirm={() => { setAskAdvanced(false); void app.setPreference('enable_advanced', true); }}
      onCancel={() => { setAskAdvanced(false); void app.setPreference('enable_advanced', false); }}>
      <p>{ENABLE_ADVANCED_WARNING}</p>
    </ConfirmDialog>
  );
  return { write, dialog };
}

/** One group as a panel. `gateAdvanced`: advanced rows are disabled while `enable_advanced` is off. */
export function SettingGroupPanel({ group, write, gateAdvanced = false }: { group: SettingGroup; write: Write; gateAdvanced?: boolean }) {
  const { state, platform } = useReady();
  const rows = visibleRows(group, { capabilities: platform.capabilities, mode: state.mode });
  if (!rows.some((r) => r.type !== 'info' && r.type !== 'heading')) return null;
  return (
    <Panel title={group.title} labelledBy={`settings-${group.id}`}>
      <div data-testid={`group-${group.id}`}>
        {group.note && <p className="kk-small kk-muted">{group.note}</p>}
        <ul className="kk-rows">
          {rows.map((r) => <SettingRow key={r.key} row={r} prefs={state.prefs} write={write} gateAdvanced={gateAdvanced} />)}
        </ul>
      </div>
    </Panel>
  );
}
