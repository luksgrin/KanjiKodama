/**
 * The optional table panels: `JlptProgressView` (`jlpt_progress.xml`, "JLPT progress", N5..N1),
 * `JoyoProgressView` (`joyo_progress.xml`, "Jōyō kanji progress", Grade 1..6, Middle school), both with
 * Locked / In progress / Passed / Burned columns, blank for 0 (`setTextOrBlankIfZero`), and
 * `LessonReviewBreakdownView` (`lesson_review_breakdown.xml`: Radical / Kanji / Vocab columns in the
 * type colours; current-level and earlier-level lesson and review rows, each only when non-zero).
 */
import type { LessonReviewBreakdown, StageCounts } from './panelData';

const blank = (n: number): string => (n === 0 ? '' : String(n));

function StageTable({ title, rows, counts, testId }: { title: string; rows: [string, number][]; counts: StageCounts; testId: string }) {
  return (
    <table className="kk-dash-panel kk-stage-table" data-testid={testId}>
      <caption>{title}</caption>
      <thead>
        <tr><th /><th>Locked</th><th>In progress</th><th>Passed</th><th>Burned</th></tr>
      </thead>
      <tbody>
        {rows.map(([label, i]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{blank(counts.locked[i]!)}</td>
            <td>{blank(counts.prePassed[i]!)}</td>
            <td>{blank(counts.passed[i]!)}</td>
            <td>{blank(counts.burned[i]!)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function JlptProgressTable({ counts }: { counts: StageCounts }) {
  return <StageTable title="JLPT progress" testId="jlpt-progress" counts={counts} rows={[['N5', 4], ['N4', 3], ['N3', 2], ['N2', 1], ['N1', 0]]} />;
}

export function JoyoProgressTable({ counts }: { counts: StageCounts }) {
  return (
    <StageTable title="Jōyō kanji progress" testId="joyo-progress" counts={counts}
      rows={[['Grade 1', 0], ['Grade 2', 1], ['Grade 3', 2], ['Grade 4', 3], ['Grade 5', 4], ['Grade 6', 5], ['Middle school', 6]]} />
  );
}

export function LessonReviewBreakdownTable({ data }: { data: LessonReviewBreakdown }) {
  const rows: [string, number[]][] = [
    ['Current-level lessons', data.lessonCurrent],
    ['Earlier-level lessons', data.lessonPast],
    ['Current-level reviews', data.reviewCurrent],
    ['Earlier-level reviews', data.reviewPast],
  ];
  return (
    <table className="kk-dash-panel kk-stage-table kk-lr-breakdown" data-testid="lesson-review-breakdown">
      <thead>
        <tr><th /><th className="radical">Radical</th><th className="kanji">Kanji</th><th className="vocabulary">Vocab</th></tr>
      </thead>
      <tbody>
        {rows.filter(([, c]) => c.some((n) => n !== 0)).map(([label, c]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className="radical">{blank(c[0]!)}</td>
            <td className="kanji">{blank(c[1]!)}</td>
            <td className="vocabulary">{blank(c[2]!)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
