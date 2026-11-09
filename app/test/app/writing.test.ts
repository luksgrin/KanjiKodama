import { describe, expect, it } from 'vitest';
import { matchRoute } from '../../src/app/router';
import { ROUTES, paths } from '../../src/ui/routes';
import { parseWritingIds } from '../../src/ui/screens/writing/WritingScreen';

describe('writing practice route', () => {
  it('carries the kanji ids and the mode', () => {
    const path = paths.writing([440, 441, 7], 'recall');
    const m = matchRoute(ROUTES, path);
    expect(m?.name).toBe('writing');
    expect(parseWritingIds(m!.query.get('ids'))).toEqual([440, 441, 7]);
    expect(m!.query.get('mode')).toBe('recall');
  });

  it('ignores junk and repeats in the ids', () => {
    expect(parseWritingIds('3,,x,3,-1,2.5,4')).toEqual([3, 4]);
    expect(parseWritingIds(null)).toEqual([]);
  });
});
