/** `fastTravel {target | levels, windowHours}` (`local/FastTravel.travel`). */

import { COOLDOWN, fastTravel } from '../../../../src/core/fastTravel';
import { HOUR } from '../../../../src/core/time';
import { argNumber, javaRound, type ActionHandler } from '../runner';

export const fastTravelActions: Record<string, ActionHandler> = {
  fastTravel: ({ rs, step, resolved }) => {
    const from = Math.max(1, rs.db.progress.userLevel);
    const target = 'target' in step ? argNumber(step, 'target', 0) : from + argNumber(step, 'levels', 0);
    resolved.from = from;
    resolved.target = target;
    let n: number;
    if ('windowHours' in step) {
      const window = javaRound(argNumber(step, 'windowHours', 0) * HOUR);
      resolved.windowMs = window;
      n = fastTravel(rs.db, target, rs.now, window);
    } else {
      resolved.windowMs = COOLDOWN;
      n = fastTravel(rs.db, target, rs.now);
    }
    return { probation: n };
  },
};
