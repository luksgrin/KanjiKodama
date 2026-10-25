/** Route → screen component. Each screen is in its own folder under `ui/screens/<name>/`. */
import type { ComponentType } from 'react';
import type { RouteName } from '../routes';
import { AboutScreen } from './about/AboutScreen';
import { AudioScreen } from './audio/AudioScreen';
import { BrowseScreen } from './browse/BrowseScreen';
import { CurriculumScreen } from './curriculum/CurriculumScreen';
import { DashboardScreen } from './dashboard/DashboardScreen';
import { FastTravelScreen } from './fastTravel/FastTravelScreen';
import { ImportScreen } from './import/ImportScreen';
import { LessonsScreen } from './lessons/LessonsScreen';
import { LevelTestScreen } from './levelTest/LevelTestScreen';
import { ReviewsScreen } from './reviews/ReviewsScreen';
import { SelfStudyScreen } from './selfStudy/SelfStudyScreen';
import { ServerScreen } from './server/ServerScreen';
import { SettingsScreen } from './settings/SettingsScreen';
import { SubjectScreen } from './subject/SubjectScreen';
import { SummaryScreen } from './summary/SummaryScreen';

export const SCREENS: Readonly<Record<RouteName, ComponentType>> = {
  dashboard: DashboardScreen,
  lessons: LessonsScreen,
  reviews: ReviewsScreen,
  summary: SummaryScreen,
  subject: SubjectScreen,
  browse: BrowseScreen,
  selfStudy: SelfStudyScreen,
  settings: SettingsScreen,
  curriculum: CurriculumScreen,
  fastTravel: FastTravelScreen,
  levelTest: LevelTestScreen,
  import: ImportScreen,
  server: ServerScreen,
  audio: AudioScreen,
  about: AboutScreen,
};
