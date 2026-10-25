/**
 * Settings → Advanced: Java's "Advanced settings" category. The `enable_advanced` switch (with its
 * warning), and the four sub-screens (lesson, review, self-study, other), shown only while it is on,
 * like `PreferencesFragment`. While it is off the core getters use the defaults for all of them.
 */
import { advancedEnabled } from '../../../core/settings';
import { useReady } from '../../hooks/useApp';
import { ADVANCED_GROUPS, ENABLE_ADVANCED } from './schema';
import { SettingGroupPanel, useSettingWriter } from './SettingRows';
import './settings.css';

export function AdvancedSettingsScreen() {
  const { state } = useReady();
  const { write, dialog } = useSettingWriter();
  const on = advancedEnabled(state.prefs);
  return (
    <div className="kk-settings">
      <SettingGroupPanel group={{ id: 'advanced', title: 'Advanced settings', rows: [ENABLE_ADVANCED] }} write={write} />
      {on
        ? ADVANCED_GROUPS.map((g) => <SettingGroupPanel key={g.id} group={g} write={write} />)
        : <p className="kk-small kk-muted" data-testid="advanced-off">Advanced settings are off: lessons and reviews use the default order and selection.</p>}
      {dialog}
    </div>
  );
}
