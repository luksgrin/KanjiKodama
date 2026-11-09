/**
 * Stand-in for a component being built elsewhere, used only by the getting-started guide. Swap it in
 * once it lands: `AppearanceStep` → `AppearancePicker` from `../../components/settings/AppearancePicker`
 * (no props; reads and writes the font and text size settings itself).
 */

// TODO: replace with <AppearancePicker /> (components/settings/AppearancePicker).
export function AppearanceStep() {
  return (
    <p className="kk-small kk-muted" data-testid="onboarding-appearance-placeholder">
      The font and text size picker comes here. Until then: Settings, Display settings and Font selection.
    </p>
  );
}
