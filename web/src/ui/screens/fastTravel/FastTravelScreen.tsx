import { SettingsScreen } from '../settings/SettingsScreen';

/** `/settings/fast-travel` (menu "Fast travel"): Settings with the fast travel dialogs; back to the previous screen when done. */
export function FastTravelScreen() {
  return <SettingsScreen autoStart="fastTravel" />;
}
