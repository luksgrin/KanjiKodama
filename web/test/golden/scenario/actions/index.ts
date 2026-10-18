/**
 * The action table: every scenario action name → its handler. Each group lives in its own file so
 * groups can be added without touching each other; see ../README.md for the inventory.
 */

import type { ActionHandler } from '../runner';
import { baseActions } from './base';
import { curriculumActions } from './curriculum';
import { dashboardActions } from './dashboard';
import { fastTravelActions } from './fastTravel';
import { importerActions } from './importer';
import { levelTestActions } from './levelTest';
import { sessionActions } from './session';

const groups: Record<string, ActionHandler>[] = [baseActions, curriculumActions, fastTravelActions, importerActions, levelTestActions, dashboardActions, sessionActions];

export const actions: Readonly<Record<string, ActionHandler>> = (() => {
  const out: Record<string, ActionHandler> = {};
  for (const g of groups) {
    for (const [name, handler] of Object.entries(g)) {
      if (name in out) throw new Error(`action ${name} is defined twice`);
      out[name] = handler;
    }
  }
  return out;
})();
