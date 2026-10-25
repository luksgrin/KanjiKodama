// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrokeDiagram } from './StrokeDiagram';
import { StudyMaterialsEditor, SynonymsLine, type StudyMaterialSave } from './StudyMaterials';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(el: ReturnType<typeof createElement>): void {
  act(() => root.render(el));
}

/** Sets an input's value the way React notices. */
function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const click = (el: Element): void => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const buttonByText = (text: string): HTMLButtonElement =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;

describe('SynonymsLine (Add synonym dialog)', () => {
  it('saves a new synonym with the Java job data', () => {
    const saves: StudyMaterialSave[] = [];
    mount(createElement(SynonymsLine, { subjectId: 440, synonyms: ['one'], meaningNote: 'mn', readingNote: null, onSave: (s) => void saves.push(s) }));
    expect(container.textContent).toContain('My synonyms: one');
    click(container.querySelector('[aria-label="Add synonym"]')!);
    const input = container.querySelector('dialog input') as HTMLInputElement;
    type(input, '  two');
    // A pasted line break becomes a space (Android's input filter), not nothing (the browser's).
    act(() => {
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      Object.assign(paste, { clipboardData: { getData: () => '\nlines ' } });
      input.setSelectionRange(5, 5);
      input.dispatchEvent(paste);
    });
    expect(input.value).toBe('  two lines ');
    click(buttonByText('Save'));
    expect(saves).toHaveLength(1);
    expect(saves[0]!.jobData).toBe('["440","mn","","one","two lines"]');
    expect(saves[0]!.job.meaningSynonyms).toEqual(['one', 'two lines']);
    expect(saves[0]!.columns).toEqual({ meaningSynonyms: '["one","two lines"]', meaningNote: 'mn', readingNote: '', studyMaterialPatched: 1 });
    expect(container.querySelector('dialog input')).toBeNull();
  });

  it('saves on Enter, ignores blanks and duplicates, and cancels', () => {
    const onSave = vi.fn();
    mount(createElement(SynonymsLine, { subjectId: 1, synonyms: ['one'], meaningNote: null, readingNote: null, onSave }));
    const open = () => click(container.querySelector('[aria-label="Add synonym"]')!);
    const enter = (input: HTMLInputElement) => act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

    open();
    type(container.querySelector('dialog input') as HTMLInputElement, 'one');
    enter(container.querySelector('dialog input') as HTMLInputElement);
    open();
    type(container.querySelector('dialog input') as HTMLInputElement, '   ');
    click(buttonByText('Save'));
    open();
    type(container.querySelector('dialog input') as HTMLInputElement, 'three');
    click(buttonByText('Cancel'));
    expect(onSave).not.toHaveBeenCalled();

    open();
    type(container.querySelector('dialog input') as HTMLInputElement, 'four');
    enter(container.querySelector('dialog input') as HTMLInputElement);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0]![0] as StudyMaterialSave).jobData).toBe('["1","","","one","four"]');
  });

  it('is read-only without onSave', () => {
    mount(createElement(SynonymsLine, { subjectId: 1, synonyms: [], meaningNote: null, readingNote: null }));
    expect(container.querySelector('[aria-label="Add synonym"]')).toBeNull();
  });
});

describe('StudyMaterialsEditor', () => {
  it('edits notes and reorders synonyms, saving the form as Java does', async () => {
    const saves: StudyMaterialSave[] = [];
    const onDone = vi.fn();
    mount(
      createElement(StudyMaterialsEditor, {
        subjectId: 7,
        synonyms: ['a', 'b'],
        meaningNote: 'old',
        readingNote: null,
        onSave: (s) => void saves.push(s),
        onDone,
      }),
    );
    const areas = container.querySelectorAll('textarea');
    type(areas[0]!, 'new meaning');
    type(areas[1]!, 'reading\nnote');
    click(container.querySelector('[aria-label="Move synonym 1 down"]')!);
    type(container.querySelector('[aria-label="Synonym 3"]') as HTMLInputElement, ' c ');
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(saves).toHaveLength(1);
    expect(saves[0]!.jobData).toBe('["7","new meaning","reading\\nnote","b","a"," c ","","","","","","",""]');
    expect(saves[0]!.job.meaningSynonyms).toEqual(['b', 'a', ' c ']);
    expect(onDone).toHaveBeenCalled();
  });
});

describe('StrokeDiagram', () => {
  it('toggles between animated and static on tap and animates stroke by stroke', () => {
    vi.useFakeTimers();
    try {
      const strokes = ['M10,10L90,10T1,5,8', 'M50,10L50,90T2,52,20'];
      mount(createElement(StrokeDiagram, { strokes, animated: true }));
      const button = container.querySelector('button')!;
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(container.querySelectorAll('.kk-stroke-ghost')).toHaveLength(2);
      // 200 ms delay, then 80 × 5 = 400 ms for the first stroke.
      act(() => vi.advanceTimersByTime(800));
      expect(container.querySelectorAll('path.kk-stroke-done:not(.kk-stroke-drawing)').length).toBeGreaterThanOrEqual(1);
      click(button);
      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(container.querySelectorAll('.kk-stroke-ghost')).toHaveLength(0);
      expect(container.querySelectorAll('.kk-stroke-label-done')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
