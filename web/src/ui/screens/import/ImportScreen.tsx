import { SettingsScreen } from '../settings/SettingsScreen';

/** `/settings/import` (deep link): Settings with the WaniKani import dialog open; back to the previous screen when done. */
export function ImportScreen() {
  return <SettingsScreen autoStart="import" />;
}
