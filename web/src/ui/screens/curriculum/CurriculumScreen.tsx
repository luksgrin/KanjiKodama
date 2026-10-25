import { SettingsScreen } from '../settings/SettingsScreen';

/** `/settings/curriculum` (deep link, menu): Settings with the curriculum dialog open; back to the previous screen when done. */
export function CurriculumScreen() {
  return <SettingsScreen autoStart="curriculum" />;
}
