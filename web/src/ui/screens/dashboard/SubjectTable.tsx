/**
 * `LiveSubjectTableView` (`live_subject_table.xml`, `LiveSubjectTableRowView`): the bold centred
 * title, then one rounded row per subject in its type colour, characters left and the extra text
 * right (`font_size_live_subject_table`, default 16 sp), both with the black text shadow. A row opens
 * the item page. Hidden when empty. Used for "Recent unlocks in the last 30 days", "Critical
 * condition items" and "Burned items in the last 30 days".
 */
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { SubjectChars } from '../../components/subject/SubjectChars';
import type { TableSubject } from './panelData';

export function SubjectTable({ title, rows, fontSize, testId }: { title: string; rows: TableSubject[]; fontSize: number; testId: string }) {
  const navigate = useNavigate();
  if (rows.length === 0) return null;
  return (
    <section className="kk-dash-panel kk-subject-table" data-testid={testId}>
      <h2 className="kk-subject-table-title" style={{ fontSize }}>{title}</h2>
      {rows.map(({ subject: s, extra }) => (
        <button key={s.id} type="button" className={`kk-subject-row ${s.object}`} style={{ fontSize }} data-testid={`subject-row-${s.id}`}
          onClick={() => navigate(paths.subject(s.id))}>
          <span className="kk-subject-row-text" lang="ja"><SubjectChars subject={s} /></span>
          <span className="kk-subject-row-extra">{extra}</span>
        </button>
      ))}
    </section>
  );
}
