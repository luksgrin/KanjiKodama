/**
 * The app's routes. Each screen lives in `ui/screens/<name>/`. Link with `paths.x(…)` or
 * `buildPath(routes.x.pattern, params)`; navigate with `useNavigate()`.
 */
import type { RouteDef } from '../app/router';

export type RouteName =
  | 'dashboard' | 'lessons' | 'reviews' | 'summary' | 'subject' | 'browse' | 'selfStudy'
  | 'settings' | 'curriculum' | 'fastTravel' | 'levelTest' | 'import' | 'server' | 'audio' | 'about'
  | 'advancedSettings' | 'searchResults' | 'selfStudyQuiz';

export interface AppRoute extends RouteDef<RouteName> {
  /** Top bar title. */
  title: string;
  /** Top-level destination (bottom nav, no back arrow). */
  tab?: boolean;
}

export const ROUTES: readonly AppRoute[] = [
  { name: 'dashboard', pattern: '/', title: 'KanjiKodama', tab: true },
  { name: 'lessons', pattern: '/lessons', title: 'Lessons' },
  { name: 'reviews', pattern: '/reviews', title: 'Reviews' },
  { name: 'summary', pattern: '/summary', title: 'Session summary' },
  { name: 'subject', pattern: '/subject/:id', title: 'Item' },
  { name: 'browse', pattern: '/browse', title: 'Browse', tab: true },
  { name: 'searchResults', pattern: '/browse/results', title: 'Search results' },
  { name: 'selfStudy', pattern: '/self-study', title: 'Self-study', tab: true },
  { name: 'selfStudyQuiz', pattern: '/self-study/quiz', title: 'Self-study' },
  { name: 'settings', pattern: '/settings', title: 'Settings', tab: true },
  { name: 'curriculum', pattern: '/settings/curriculum', title: 'Curriculum' },
  { name: 'fastTravel', pattern: '/settings/fast-travel', title: 'Fast travel' },
  { name: 'levelTest', pattern: '/settings/level-test', title: 'Level test' },
  { name: 'import', pattern: '/settings/import', title: 'WaniKani import' },
  { name: 'server', pattern: '/settings/server', title: 'Server' },
  { name: 'audio', pattern: '/settings/audio', title: 'Audio' },
  { name: 'about', pattern: '/settings/about', title: 'About' },
  { name: 'advancedSettings', pattern: '/settings/advanced', title: 'Advanced settings' },
];

export const ROUTE_BY_NAME = Object.fromEntries(ROUTES.map((r) => [r.name, r])) as Readonly<Record<RouteName, AppRoute>>;

/** Path builders. */
export const paths = {
  dashboard: () => '/',
  lessons: () => '/lessons',
  reviews: () => '/reviews',
  summary: () => '/summary',
  subject: (id: number) => `/subject/${id}`,
  browse: () => '/browse',
  selfStudy: () => '/self-study',
  settings: () => '/settings',
  curriculum: () => '/settings/curriculum',
  fastTravel: () => '/settings/fast-travel',
  levelTest: () => '/settings/level-test',
  import: () => '/settings/import',
  server: () => '/settings/server',
  audio: () => '/settings/audio',
  about: () => '/settings/about',
  advancedSettings: () => '/settings/advanced',
  /** The running self-study session (also the level test rounds). */
  selfStudyQuiz: () => '/self-study/quiz',
  /** `t`: 0 level, 1 keyword, 2 advanced (JSON); `q`: the level, query or parameters; `preset`: its name. */
  searchResults: (t: number = 0, q: string = '1', preset?: string) =>
    `/browse/results?${new URLSearchParams({ t: String(t), q, ...(preset === undefined ? {} : { preset }) }).toString()}`,
} as const satisfies Record<RouteName, (...a: never[]) => string>;
