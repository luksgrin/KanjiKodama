/** SRS breakdown (`SrsBreakDownView`): visible subjects per stage group. */
const NAMES = ['Apprentice', 'Guru', 'Master', 'Enlightened', 'Burned'] as const;
const CLASSES = ['apprentice', 'guru', 'master', 'enlightened', 'burned'] as const;

export function SrsBreakdown({ counts }: { counts: number[] }) {
  return (
    <ul className="kk-srs">
      {NAMES.map((name, i) => (
        <li key={name} className={`kk-srs-tile ${CLASSES[i]}`}>
          <span className="kk-srs-count" data-testid={`srs-${CLASSES[i]}`}>{counts[i] ?? 0}</span>
          <span className="kk-srs-name">{name}</span>
        </li>
      ))}
    </ul>
  );
}
