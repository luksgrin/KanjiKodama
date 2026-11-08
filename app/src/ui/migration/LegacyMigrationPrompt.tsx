/**
 * The one-time "Move progress from the old app?" offer after the Android app was installed over the
 * Java app (src/progress/legacyMigration.ts). Shown once the app is ready, with the Java-style dialogs
 * of the settings screens: the old progress file's summary, "Not now" / "Move"; the busy dialog; the
 * result; then "Remove old app data?" ("Keep" / "Remove"), never automatic.
 *
 * Renders nothing on the web build and when there is nothing to move.
 */
import { useEffect, useRef } from 'react';
import {
  LEGACY_TEXTS, findLegacyData, moveLegacyData, removeLegacyData, setLegacyMarker, type LegacyOffer,
} from '../../progress/legacyMigration';
import type { LegacyApi } from '../../platform';
import { useApp, useAppState } from '../hooks/useApp';
import { afterProgressChange } from '../screens/settings/progressFlow';
import { useAlerts } from '../screens/settings/useAlerts';

export function LegacyMigrationPrompt() {
  const app = useApp();
  const state = useAppState();
  const alerts = useAlerts();
  const checked = useRef(false);
  const ready = state.status.kind === 'ready';
  const platform = state.platform;
  const serverMode = state.mode === 'server';

  useEffect(() => {
    if (!ready || !platform || checked.current) return;
    const legacy = platform.capabilities.legacyMigration ? platform.legacy : undefined;
    if (!legacy) return;
    checked.current = true;

    const offerRemoval = (api: LegacyApi) => alerts.show({
      title: LEGACY_TEXTS.removeTitle,
      warning: true,
      message: LEGACY_TEXTS.remove,
      testId: 'dialog-legacy-remove',
      onCancel: () => { alerts.close(); void setLegacyMarker(app.db, 'kept', app.clock.now()); },
      negative: { label: 'Keep', testId: 'legacy-keep', onClick: () => { alerts.close(); void setLegacyMarker(app.db, 'kept', app.clock.now()); } },
      positive: {
        label: 'Remove',
        testId: 'legacy-remove',
        onClick: () => void (async () => {
          const ok = await alerts.run(LEGACY_TEXTS.removing, async () => { await removeLegacyData(app, api, app.clock.now()); return true; });
          if (ok) alerts.message(null, LEGACY_TEXTS.removed);
        })(),
      },
    });

    const offerMove = (api: LegacyApi, offer: Extract<LegacyOffer, { kind: 'ready' }>) => alerts.show({
      title: LEGACY_TEXTS.offerTitle,
      message: LEGACY_TEXTS.offer(offer.summary),
      testId: 'dialog-legacy-move',
      onCancel: alerts.close,
      negative: { label: 'Not now', testId: 'legacy-not-now', onClick: alerts.close },
      positive: {
        label: 'Move',
        testId: 'legacy-move',
        onClick: () => void (async () => {
          const res = await alerts.run(LEGACY_TEXTS.moving, () => moveLegacyData(app, api, offer, app.clock.now()));
          if (!res) return;
          afterProgressChange(app, platform);
          alerts.message(null, res.message, () => offerRemoval(api));
        })(),
      },
    });

    void findLegacyData(app, legacy, { serverMode }).then((offer) => {
      if (!offer) return;
      if (offer.kind === 'ready') {
        offerMove(legacy, offer);
        return;
      }
      alerts.show({
        title: LEGACY_TEXTS.errorTitle,
        warning: true,
        message: LEGACY_TEXTS.error(offer.message),
        testId: 'dialog-legacy-error',
        onCancel: alerts.close,
        negative: { label: 'Don’t ask again', testId: 'legacy-skip', onClick: () => { alerts.close(); void setLegacyMarker(app.db, 'skipped', app.clock.now()); } },
        positive: { label: 'OK', onClick: alerts.close },
      });
    }, () => undefined);
  }, [ready, platform, serverMode, app, alerts]);

  return <>{alerts.node}</>;
}
