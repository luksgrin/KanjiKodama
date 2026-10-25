/**
 * `/settings/advanced` (older deep link): Java has no separate page for the "Advanced settings"
 * category, so this is the Settings root scrolled to that category.
 */
import { useEffect } from 'react';
import { SettingsScreen } from './SettingsScreen';

export function AdvancedSettingsScreen() {
  useEffect(() => {
    document.querySelector('[data-testid="category-advanced"]')?.scrollIntoView?.({ block: 'start' });
  }, []);
  return <SettingsScreen />;
}
