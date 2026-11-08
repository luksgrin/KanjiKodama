// Wave 6 (owner's phone): mm_btn drawn as Java's layer-list, no focus highlight in touch mode, and the
// leaving session fragment sliding out (FragmentTransaction.replace + setCustomAnimations(enter, exit)).
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { trackFocusMode } from '../../src/ui/theme/focusMode';
import { playExit, snapshotFragment } from '../../src/ui/components/session/exitingFragment';

const base = readFileSync(join(process.cwd(), 'src/ui/theme/base.css'), 'utf8');

describe('mm_btn', () => {
  it('uses the layer-list insets, truncated to device px', () => {
    for (const dp of [3, 5, 6, 8, 12, 14]) {
      expect(base).toContain(`--kk-bt${dp}: calc(round(down, calc(${dp}px * var(--kk-dpr, 1) + 0.001px), 1px) / var(--kk-dpr, 1));`);
    }
  });
  it('writes the disabled overlay (#66FFFFFF, Android ARGB) as 40 % white, not CSS #RRGGBBAA', () => {
    expect(base).not.toMatch(/linear-gradient\(#66FFFFFF/);
    expect(base).toContain('rgb(255 255 255 / 0.4)');
  });
  it('uses Android decelerate / accelerate curves for the fragment slides', () => {
    expect(base).toContain('.kk-slide-rtl { animation: kk-slide-rtl 150ms cubic-bezier(0.3333, 0.6667, 0.6667, 1); }');
    expect(base).toContain('.kk-slide-exit-rtl { animation: kk-slide-exit-rtl 150ms cubic-bezier(0.3333, 0, 0.6667, 0.3333) forwards; }');
  });
});

describe('trackFocusMode', () => {
  it('leaves touch mode on navigation keys only and returns on a touch', () => {
    const root = document.createElement('div');
    const target = new EventTarget() as unknown as Window;
    trackFocusMode(root, target);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(root.classList.contains('kk-nontouch')).toBe(false);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(root.classList.contains('kk-nontouch')).toBe(true);
    target.dispatchEvent(new Event('pointerdown'));
    expect(root.classList.contains('kk-nontouch')).toBe(false);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', isComposing: true }));
    expect(root.classList.contains('kk-nontouch')).toBe(false);
  });
});

describe('exiting fragment', () => {
  it('copies the old view inertly, keeps typed text, and goes away without an animation', () => {
    const clip = document.createElement('div');
    const old = document.createElement('div');
    old.className = 'kk-fragment kk-slide-rtl';
    old.innerHTML = '<input data-testid="answer-field" id="a"><button data-testid="next">Next</button>';
    (old.querySelector('input') as HTMLInputElement).value = 'typed';
    clip.append(old);
    document.body.append(clip);
    const copy = snapshotFragment(old);
    expect(copy.className).toBe('kk-fragment kk-fragment-exit');
    expect(copy.getAttribute('aria-hidden')).toBe('true');
    expect(copy.querySelector('[data-testid]')).toBeNull();
    expect(copy.querySelector('[id]')).toBeNull();
    expect((copy.querySelector('input') as HTMLInputElement).value).toBe('typed');
    const entering = document.createElement('div');
    old.replaceWith(entering);
    playExit(clip, entering, copy, 'RTL');
    // jsdom has no animations: removed at once.
    expect(clip.contains(copy)).toBe(false);
    clip.remove();
  });
});
