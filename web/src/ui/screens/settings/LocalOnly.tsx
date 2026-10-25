import type { ReactNode } from 'react';
import { Panel } from '../../components/Panel';
import { useReady } from '../../hooks/useApp';

/**
 * Renders `children` in local mode only. In server mode these entries are hidden from Settings
 * (`LocalMode.LOCAL_PREFERENCES`); a stale link lands here.
 */
export function LocalOnly({ children }: { children: ReactNode }) {
  const { state } = useReady();
  if (state.mode === 'server') {
    return (
      <Panel>
        <p data-testid="local-only">Only available in local mode. In server mode the server decides levels and unlocks.</p>
      </Panel>
    );
  }
  return <>{children}</>;
}
