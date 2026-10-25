/**
 * The home-screen widget (Android): the local `Widget` plugin (web/android/.../WidgetPlugin.java,
 * SessionWidgetProvider.java, a port of `services/SessionWidgetProvider`). The app hands it the
 * counts (core `planWidget`); the native side stores them, redraws every widget and sets an inexact
 * alarm for the next scheduled entry, so the widget moves on at the next review hour without the app.
 */
import { registerPlugin } from '@capacitor/core';
import type { WidgetApi, WidgetUpdate } from './index';

export interface WidgetPlugin {
  update(options: WidgetUpdate): Promise<{ widgets: number }>;
  /** Asks the launcher to pin a widget (Android 8+, when the launcher supports it). */
  requestPin(): Promise<{ requested: boolean }>;
}

export const Widget = registerPlugin<WidgetPlugin>('Widget');

export function createAndroidWidget(plugin: WidgetPlugin = Widget): WidgetApi {
  return {
    supported: true,
    async update(u) {
      // Always sent: the background worker may have stored newer counts natively since our last call.
      await plugin.update({
        lessons: u.lessons, reviews: u.reviews, nextAt: u.nextAt,
        schedule: (u.schedule ?? []).map((e) => ({ at: e.at, lessons: e.lessons, reviews: e.reviews, nextAt: e.nextAt })),
      });
    },
    async requestPin() {
      return (await plugin.requestPin()).requested;
    },
  };
}

export const androidWidget: WidgetApi = createAndroidWidget();
