/**
 * Route → screen component. Each screen is in its own folder under `ui/screens/<name>/`.
 *
 * The dashboard is in the main bundle; every other screen is its own chunk, loaded on first use
 * (start-up downloads and parses less). `preloadScreen(name)` starts loading a chunk early (the shell
 * preloads the current route during start-up and the session screens when idle);
 * `preloadAllScreens()` loads all of them (jsdom tests, see test/setup/screens.ts, so screens render
 * synchronously there).
 */
import { createElement, use, type ComponentType } from 'react';
import type { RouteName } from '../routes';
import { DashboardScreen } from './dashboard/DashboardScreen';

type Loader = () => Promise<ComponentType>;

const LOADERS: Readonly<Record<Exclude<RouteName, 'dashboard'>, Loader>> = {
  lessons: () => import('./lessons/LessonsScreen').then((m) => m.LessonsScreen),
  reviews: () => import('./reviews/ReviewsScreen').then((m) => m.ReviewsScreen),
  summary: () => import('./summary/SummaryScreen').then((m) => m.SummaryScreen),
  subject: () => import('./subject/SubjectScreen').then((m) => m.SubjectScreen),
  browse: () => import('./browse/BrowseScreen').then((m) => m.BrowseScreen),
  searchResults: () => import('./browse/SearchResultsScreen').then((m) => m.SearchResultsScreen),
  selfStudy: () => import('./selfStudy/SelfStudyScreen').then((m) => m.SelfStudyScreen),
  selfStudyQuiz: () => import('./selfStudy/SelfStudyQuizScreen').then((m) => m.SelfStudyQuizScreen),
  settings: () => import('./settings/SettingsScreen').then((m) => m.SettingsScreen),
  advancedSettings: () => import('./settings/AdvancedSettingsScreen').then((m) => m.AdvancedSettingsScreen),
  curriculum: () => import('./curriculum/CurriculumScreen').then((m) => m.CurriculumScreen),
  fastTravel: () => import('./fastTravel/FastTravelScreen').then((m) => m.FastTravelScreen),
  levelTest: () => import('./levelTest/LevelTestScreen').then((m) => m.LevelTestScreen),
  import: () => import('./import/ImportScreen').then((m) => m.ImportScreen),
  server: () => import('./server/ServerScreen').then((m) => m.ServerScreen),
  audio: () => import('./audio/AudioScreen').then((m) => m.AudioScreen),
  about: () => import('./about/AboutScreen').then((m) => m.AboutScreen),
  keyboardHelp: () => import('./keyboardHelp/KeyboardHelpScreen').then((m) => m.KeyboardHelpScreen),
  themeCustomization: () => import('./themeCustomization/ThemeCustomizationScreen').then((m) => m.ThemeCustomizationScreen),
  welcome: () => import('./onboarding/OnboardingScreen').then((m) => m.OnboardingScreen),
  stats: () => import('./stats/StatsScreen').then((m) => m.StatsScreen),
};

const loaded = new Map<RouteName, ComponentType>([['dashboard', DashboardScreen]]);
const pending = new Map<RouteName, Promise<ComponentType>>();

/** Starts (or reuses) loading the screen's chunk. */
export function preloadScreen(name: RouteName): Promise<ComponentType> {
  const done = loaded.get(name);
  if (done) return Promise.resolve(done);
  let p = pending.get(name);
  if (!p) {
    p = LOADERS[name as Exclude<RouteName, 'dashboard'>]().then((c) => {
      loaded.set(name, c);
      return c;
    });
    p.catch(() => pending.delete(name)); // a failed chunk load is retried on the next visit
    pending.set(name, p);
  }
  return p;
}

export function preloadAllScreens(): Promise<unknown> {
  return Promise.all((Object.keys(LOADERS) as RouteName[]).map(preloadScreen));
}

/** Renders the loaded screen; suspends (nearest <Suspense>) while its chunk loads. */
function lazyScreen(name: RouteName): ComponentType {
  function Screen() {
    const c = loaded.get(name) ?? use(preloadScreen(name));
    return createElement(c);
  }
  Screen.displayName = `Screen(${name})`;
  return Screen;
}

export const SCREENS: Readonly<Record<RouteName, ComponentType>> = {
  dashboard: DashboardScreen,
  ...(Object.fromEntries((Object.keys(LOADERS) as RouteName[]).map((n) => [n, lazyScreen(n)])) as Record<Exclude<RouteName, 'dashboard'>, ComponentType>),
};
