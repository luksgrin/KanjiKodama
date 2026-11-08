/**
 * Settings. The root lists the sub-screens
 * (`schema.ts` `SETTINGS_SCREENS`), then the categories "Advanced settings" (the switch, and the four
 * advanced sub-screens while it is on), "Progress" (`ProgressSection.tsx`) and "Other actions".
 * A sub-screen is `/settings?screen=<key>` with its title in the toolbar.
 *
 * Curriculum order, fast travel and the WaniKani import are dialog chains over this screen
 * (`CurriculumUi`, `ProgressPreferences`); their routes render this screen with `autoStart`.
 */
import { useEffect, useRef, useState } from 'react';
import { advancedEnabled, type Preferences } from '../../../core/settings';
import type { NotificationPermission } from '../../../platform';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate, useRoute } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { useToolbar } from '../../shell/toolbar';
import { toast } from '../../shell/toast';
import { InstallHint } from '../about/InstallHint';
import { useCurriculumFlow } from '../curriculum/curriculumFlow';
import { useFastTravelFlow } from '../fastTravel/fastTravelFlow';
import { useImportFlow } from '../import/importFlow';
import { DATA_IMPORT_EXPORT_SCREEN, DATA_IMPORT_EXPORT_TITLE, DataImportExportPage, OtherActionsCategory } from './OtherActions';
import { ProgressCategory } from './ProgressSection';
import { FONT_IMPORT_SCREEN, FONT_SCREEN_TITLES, FONT_SELECTION_SCREEN, FontImportPage, FontSelectionPage } from './fontScreens';
import {
  ADVANCED_CATEGORY_TITLE,
  ADVANCED_GROUPS,
  ENABLE_ADVANCED,
  SETTINGS_SCREENS,
  XML_DEFAULT_DIFFERS_FROM_GETTER,
  findGroup,
  groupTitle,
  groupVisible,
  shownValue,
  type BoolSetting,
  type SettingGroup,
} from './schema';
import { PrefCategory, PrefRow, SettingGroupRows, SettingRow, useScreenLinkActions, useSettingWriter, type Actions } from './SettingRows';
import { useAlerts, type Alerts } from './useAlerts';
import './settings.css';

/** The warning before confirmations and tutorials are reset. */
export const RESET_TUTORIALS_WARNING = 'This will re-enable all UI confirmations and reinstate all tutorial messages.'
  + ' Are you sure you want to continue?';

/** "Reset UI confirmations and tutorials" (plus the web build's install hint). */
export const RESET_TUTORIALS_VALUES: Readonly<Preferences> = {
  ui_confirm_abandon_session: true,
  ui_confirm_wrapup_session: true,
  keyboard_help_dismissed: false,
  browse_overview_dismissed: false,
  search_result_dismissed: false,
  start_self_study_dismissed: false,
  session_log_dismissed: false,
  notification_permission_asked: false,
  kk_install_hint_dismissed: false,
};

export const LOCAL_ONLY_MESSAGE = 'Only available in local mode. In server mode the server decides levels and unlocks.';

export type AutoStart = 'curriculum' | 'fastTravel' | 'import';

/**
 * AndroidX writes a row's XML default when a settings screen first shows it; for the keys whose
 * getter default differs, do the same so the app then behaves as the screen shows.
 */
function usePersistShownDefaults() {
  const app = useApp();
  useEffect(() => {
    const prefs = app.get().prefs;
    for (const g of SETTINGS_SCREENS) {
      for (const r of g.rows) {
        if (r.type === 'bool' && XML_DEFAULT_DIFFERS_FROM_GETTER.includes(r.key) && typeof prefs[r.key] !== 'boolean') {
          void app.setPreference(r.key, shownValue(r as BoolSetting, prefs));
        }
      }
    }
  }, [app]);
}

/** `grant_notification_permission`: shown while the permission is not granted (Android 13+). */
function useNotificationActions(): Actions {
  const { platform } = useReady();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const api = platform.notifications;
  const supported = platform.capabilities.notifications && api?.supported === true;
  useEffect(() => {
    if (!supported) return;
    let live = true;
    api.permission().then((p) => { if (live) setPermission(p); }, () => undefined);
    return () => { live = false; };
  }, [api, supported]);
  if (!supported || permission === null || permission === 'granted') return {};
  return {
    grant_notification_permission: () => {
      void api.requestPermission().then((ok) => setPermission(ok ? 'granted' : 'denied'), () => undefined);
    },
  };
}

function Root({ alerts, flows, write }: {
  alerts: Alerts; flows: { curriculum: () => void; fastTravel: () => void; import: () => void }; write: ReturnType<typeof useSettingWriter>['write'];
}) {
  const app = useApp();
  const nav = useNavigate();
  const { state, platform } = useReady();
  const ctx = { capabilities: platform.capabilities, mode: state.mode };
  const open = (g: SettingGroup) => nav(`${paths.settings()}?screen=${g.id}`);
  const advancedOn = advancedEnabled(state.prefs);
  const resetTutorials = () => alerts.show({
    title: 'Reset confirmations and tutorials?',
    warning: true,
    message: RESET_TUTORIALS_WARNING,
    testId: 'dialog-reset-tutorials',
    onCancel: alerts.close,
    negative: { label: 'No', onClick: alerts.close },
    positive: {
      label: 'Yes',
      onClick: () => {
        alerts.close();
        void Promise.all(Object.entries(RESET_TUTORIALS_VALUES).map(([k, v]) => app.setPreference(k, v)))
          .then(() => toast('Confirmations and tutorials reset', { long: true }));
      },
    },
  });
  return (
    <ul className="kk-prefs kk-prefs-root" data-testid="settings-root">
      {SETTINGS_SCREENS.filter((g) => groupVisible(g, ctx)).map((g) => (
        <PrefRow key={g.id} title={groupTitle(g, state.mode)} summary={g.note} testId={`screen-${g.id}`} onClick={() => open(g)} />
      ))}
      <PrefCategory title={ADVANCED_CATEGORY_TITLE} testId="category-advanced">
        <SettingRow row={ENABLE_ADVANCED} prefs={state.prefs} write={write} />
        {advancedOn && ADVANCED_GROUPS.map((g) => (
          <PrefRow key={g.id} title={g.title} testId={`screen-${g.id}`} onClick={() => open(g)} />
        ))}
      </PrefCategory>
      <ProgressCategory alerts={alerts} flows={flows} />
      <OtherActionsCategory alerts={alerts} onResetTutorials={resetTutorials} />
    </ul>
  );
}

export function SettingsScreen({ autoStart }: { autoStart?: AutoStart } = {}) {
  const nav = useNavigate();
  const route = useRoute();
  const { state } = useReady();
  const { write, dialog } = useSettingWriter();
  const alerts = useAlerts();
  const actions = { ...useNotificationActions(), ...useScreenLinkActions() };
  const flows = {
    curriculum: useCurriculumFlow(alerts),
    fastTravel: useFastTravelFlow(alerts),
    import: useImportFlow(alerts),
  };
  usePersistShownDefaults();

  const screenId = route.name === 'settings' ? route.query.get('screen') : null;
  let group = screenId === null ? undefined : findGroup(screenId);
  // The advanced sub-screens are hidden while advanced settings are off (`setVisibility`).
  if (group && ADVANCED_GROUPS.includes(group) && !advancedEnabled(state.prefs)) group = undefined;
  const dataPage = screenId === DATA_IMPORT_EXPORT_SCREEN;
  const fontPage = screenId !== null ? FONT_SCREEN_TITLES[screenId] : undefined;
  const title = group ? groupTitle(group, state.mode) : dataPage ? DATA_IMPORT_EXPORT_TITLE : fontPage ?? 'Settings';
  useToolbar({ title });

  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    const done = () => nav.back();
    if (state.mode === 'server') alerts.message(null, LOCAL_ONLY_MESSAGE, done);
    else flows[autoStart](done);
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <div className="kk-settings" data-testid={group ? `settings-screen-${group.id}` : 'settings'}>
      {group ? (
        <SettingGroupRows group={group} write={write} actions={actions} />
      ) : dataPage ? (
        <DataImportExportPage />
      ) : screenId === FONT_SELECTION_SCREEN ? (
        <FontSelectionPage />
      ) : screenId === FONT_IMPORT_SCREEN ? (
        <FontImportPage />
      ) : (
        <>
          <InstallHint />
          <Root alerts={alerts} flows={flows} write={write} />
        </>
      )}
      {dialog}
      {alerts.node}
    </div>
  );
}
