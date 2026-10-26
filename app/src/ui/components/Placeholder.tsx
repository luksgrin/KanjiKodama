import type { ReactNode } from 'react';

/** Stand-in for screens not built yet. */
export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="kk-placeholder">
      <p className="kk-small">{title}: coming soon.</p>
      {children}
    </div>
  );
}
