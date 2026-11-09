/** Texts of the study garden (dashboard panel and screen). */
import { dayTotal, weekday, type ActivityDay } from '../../../core/stats';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** "1 day", "3 days". */
export function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** The dashboard's streak line. */
export function streakLine(current: number, best: number, studiedToday: boolean): string {
  if (current === 0) return best > 0 ? `No streak yet today · best ${days(best)}` : 'Plant your first sprout today';
  const tail = studiedToday ? '' : ' · study today to keep it';
  return `Streak ${days(current)}${tail}${best > current ? ` · best ${days(best)}` : ''}`;
}

/** "Mon 9 Nov 2026". */
export function longDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return `${WEEKDAY_SHORT[weekday(key)]} ${d} ${MONTH_NAMES[m - 1]!.slice(0, 3)} ${y}`;
}

function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a day saw: "5 lessons, 40 reviews (90 % right), 2 self-study" or "Nothing studied". */
export function dayDetail(day: ActivityDay | undefined): string {
  if (day === undefined || dayTotal(day) === 0) return 'Nothing studied';
  const parts: string[] = [];
  if (day.lessons > 0) parts.push(plural(day.lessons, 'lesson'));
  if (day.reviews > 0) parts.push(`${plural(day.reviews, 'review')} (${Math.floor((day.correct * 100) / day.reviews)} % right)`);
  if (day.selfStudy > 0) parts.push(`${day.selfStudy} self-study`);
  return parts.join(', ');
}
