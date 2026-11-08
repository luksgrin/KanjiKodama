/**
 * The yellow "Please take a moment to review some hints for your keyboard settings" box at the top
 * of the dashboard (`activity_main.xml` keyboardHelpView, `MainActivity`): shown until DISMISS
 * (`keyboard_help_dismissed`, reset by "Reset UI confirmations and tutorials"); VIEW opens Keyboard
 * help. Only where the keyboard settings it explains exist (`imeFlags`: the Android build).
 */
import { prefBoolean } from '../../../core/settings';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import './keyboardHelpBanner.css';

export const KEYBOARD_HELP_DISMISSED_KEY = 'keyboard_help_dismissed';

export function KeyboardHelpBanner() {
  const app = useApp();
  const nav = useNavigate();
  const { state, platform } = useReady();
  if (platform.capabilities.imeFlags !== true || prefBoolean(state.prefs, KEYBOARD_HELP_DISMISSED_KEY, false)) return null;
  return (
    <div className="kk-kbhelp-banner" data-testid="keyboard-help-banner">
      <p className="kk-kbhelp-banner-text">Please take a moment to review some hints for your keyboard settings</p>
      <div className="kk-kbhelp-banner-actions">
        <button type="button" className="kk-kbhelp-banner-btn" data-testid="keyboard-help-dismiss"
          onClick={() => void app.setPreference(KEYBOARD_HELP_DISMISSED_KEY, true)}>Dismiss</button>
        <button type="button" className="kk-kbhelp-banner-btn" data-testid="keyboard-help-view" onClick={() => nav(paths.keyboardHelp())}>View</button>
      </div>
    </div>
  );
}
