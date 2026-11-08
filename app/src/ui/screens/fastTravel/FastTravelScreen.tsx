/**
 * `/settings/fast-travel` (menu "Fast travel..."): Java shows the fast travel dialogs over the screen the
 * menu was opened on (the dashboard), so this is the dashboard with the dialogs; back to the previous
 * screen when they are done.
 */
import { useEffect, useRef } from 'react';
import { useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { DashboardScreen } from '../dashboard/DashboardScreen';
import { LOCAL_ONLY_MESSAGE } from '../settings/SettingsScreen';
import { useAlerts } from '../settings/useAlerts';
import { useFastTravelFlow } from './fastTravelFlow';

export function FastTravelScreen() {
  const nav = useNavigate();
  const { state } = useReady();
  const alerts = useAlerts();
  const flow = useFastTravelFlow(alerts);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const done = () => nav.back();
    if (state.mode === 'server') alerts.message(null, LOCAL_ONLY_MESSAGE, done);
    else flow(done);
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <DashboardScreen />
      {alerts.node}
    </>
  );
}
