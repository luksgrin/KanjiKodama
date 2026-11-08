import type { Capabilities } from '../../../platform';
import { ANDROID_NOTE, limitationsFor } from './limitations';

export function KnownLimitations({ capabilities }: { capabilities: Capabilities }) {
  const list = limitationsFor(capabilities);
  if (list.length === 0) return <p className="kk-small">{ANDROID_NOTE}</p>;
  return (
    <ol className="kk-limitations kk-small">
      {list.map((l) => (
        <li key={l.title}><strong>{l.title}</strong> {l.text}</li>
      ))}
    </ol>
  );
}
