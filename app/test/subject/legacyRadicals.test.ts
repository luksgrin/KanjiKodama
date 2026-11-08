/** `show_legacy`: the old radical name and mnemonic on the item page. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LoadedContent } from '../../src/content/contentFile';
import { isLegacyRadical, legacyMnemonic, legacyName } from '../../src/core/legacyRadicals';
import { showLegacy } from '../../src/core/settings/subjectInfo';
import { ItemPage } from '../../src/ui/components/subject/ItemPage';
import { HAS_WK_CONTENT, loadBuiltContent } from './contentFile';

describe('LegacyRadicals', () => {
  it('has the renamed radicals table', () => {
    expect(isLegacyRadical(61)).toBe(true);
    expect(legacyName(61)).toBe('Antenna');
    expect(legacyMnemonic(61)).toMatch(/^Doesn't this look like the <radical>antenna<\/radical>/);
    expect(isLegacyRadical(1)).toBe(false);
    expect(legacyName(1)).toBeNull();
    expect(showLegacy({})).toBe(false);
  });
});

describe.skipIf(!HAS_WK_CONTENT)('item page with show_legacy', () => {
  let loaded: LoadedContent;
  beforeAll(async () => {
    loaded = await loadBuiltContent();
  }, 180_000);

  it('shows "Old name" and "Old mnemonic" after the meaning hint only with the setting', () => {
    const subject = loaded.content.byId.get(61)!;
    const render = (settings: Record<string, boolean>) => renderToStaticMarkup(createElement(ItemPage, { subject, content: loaded, settings }));
    expect(render({})).not.toContain('Old name');
    const html = render({ show_legacy: true });
    expect(html).toContain('<b>Old name</b>: Antenna');
    expect(html.indexOf('Old mnemonic</b>:')).toBeGreaterThan(html.indexOf('Meaning mnemonic</b>:'));
    expect(html.indexOf('Old mnemonic</b>:')).toBeLessThan(html.indexOf('My synonyms</b>:'));
    // Hidden with the WaniKani mnemonics (`showMeaningMnemonic`).
    expect(render({ show_legacy: true, always_hide_wk_mnemonic: true })).not.toContain('Old name');
  });
});
