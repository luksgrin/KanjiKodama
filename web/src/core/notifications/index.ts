/**
 * Review notifications planned ahead (Android build). Java: services/NotificationWorker,
 * services/BackgroundAlarmReceiver, SubjectAggregatesDao.getAlertContext. See ./plan.ts.
 */
export {
  MAX_REVIEW_NOTIFICATIONS,
  REVIEW_NOTIFICATION_CHANNEL,
  REVIEW_NOTIFICATION_WINDOW,
  enableNotifications,
  notificationHour,
  planReviewNotifications,
  reviewNotificationText,
  type ReviewNotificationOptions,
  type ReviewTime,
} from './plan';
export { planWidget, type WidgetCounts, type WidgetEntry, type WidgetPlan, type WidgetPlanOptions } from './widget';
