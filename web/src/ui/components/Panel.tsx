import type { ReactNode } from 'react';

/** A dashboard / settings card (`.kk-panel`). */
export function Panel({ title, children, className, labelledBy }: { title?: ReactNode; children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section className={`kk-panel${className ? ` ${className}` : ''}`} aria-labelledby={labelledBy}>
      {title !== undefined && <h2 id={labelledBy}>{title}</h2>}
      {children}
    </section>
  );
}
