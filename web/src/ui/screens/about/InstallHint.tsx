/**
 * The install section (About) and the dismissible onboarding hint (Settings): web build only, and
 * not when the app already runs from the home screen.
 */
import { useApp, useReady } from '../../hooks/useApp';
import { INSTALL_BENEFIT, INSTALL_HINT_DISMISSED_KEY, INSTALL_STEPS, isWebBuild, useInstall } from './install';

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
    </>
  );
}

/** About → Install: always on the web build; says so when already installed. */
export function InstallSection() {
  const { platform } = useReady();
  const install = useInstall();
  if (!isWebBuild(platform.capabilities)) return null;
  return (
    <section className="kk-panel" data-testid="install-section" aria-labelledby="about-install">
      <h2 id="about-install">Install</h2>
      {install.standalone ? <p className="kk-small">Running from the home screen.</p> : <InstallActions />}
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
