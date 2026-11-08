/**
 * The install section (About) and the dismissible onboarding hint (Settings): web build only, and
 * not when the app already runs from the home screen.
 */
import { useApp, useReady } from '../../hooks/useApp';
import { ANDROID_APP_TEXT, INSTALL_BENEFIT, INSTALL_HINT_DISMISSED_KEY, INSTALL_STEPS, androidApkUrl, isWebBuild, useInstall } from './install';

/** The Android app's download link (the APK of this version). */
function AndroidApp() {
  return (
    <p className="kk-small kk-android-app" data-testid="android-app">
      {ANDROID_APP_TEXT}{' '}
      <a href={androidApkUrl(__APP_VERSION__)} data-testid="android-app-download" rel="noopener">Download the Android app ({__APP_VERSION__})</a>
    </p>
  );
}

function InstallActions() {
  const install = useInstall();
  return (
    <>
      {install.canPrompt && (
        <div className="kk-btn-row">
          <button type="button" className="kk-btn small" onClick={() => void install.prompt()} data-testid="install-prompt">Install app</button>
        </div>
      )}
      <ul className="kk-small kk-install-steps" data-testid="install-steps">
        {INSTALL_STEPS.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <p className="kk-small kk-muted">{INSTALL_BENEFIT}</p>
      <AndroidApp />
    </>
  );
}

/** About → Install: always on the web build; says so when already installed. */
export function InstallSection() {
  const { platform } = useReady();
  const install = useInstall();
  if (!isWebBuild(platform.capabilities)) return null;
  return (
    <section data-testid="install-section" aria-labelledby="about-install">
      <h4 id="about-install">Install</h4>
      {install.standalone ? <><p className="kk-small">Running from the home screen.</p><AndroidApp /></> : <InstallActions />}
    </section>
  );
}

/** First-run hint: web build, not installed, not dismissed. */
export function InstallHint() {
  const app = useApp();
  const { platform, state } = useReady();
  const install = useInstall();
  if (!isWebBuild(platform.capabilities) || install.standalone || state.prefs[INSTALL_HINT_DISMISSED_KEY] === true) return null;
  return (
    <div className="kk-banner" role="note" data-testid="install-hint">
      <div className="kk-banner-text">
        <strong>Add KanjiKodama to your home screen.</strong>
        <InstallActions />
      </div>
      <button type="button" className="kk-btn small secondary" data-testid="install-hint-dismiss"
        onClick={() => void app.setPreference(INSTALL_HINT_DISMISSED_KEY, true)}>Got it</button>
    </div>
  );
}
