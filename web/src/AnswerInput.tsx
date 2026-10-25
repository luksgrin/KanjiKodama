import { useEffect, useRef } from 'react';
import { FixupWatcher, newAnswerEditable, simulateInput, type SpanEditable } from './core/kana';

interface Props {
  reading: boolean;
  disabled: boolean;
  /** Changes whenever a new question is shown, to clear and refocus the field. */
  questionKey: string;
  onChange(value: string): void;
  onEnter(): void;
  onImeEvent?(text: string): void;
}

/**
 * A submitted reading as the app converts it (`PseudoIme.simulateInput`: a trailing `n` becomes ん).
 * Empty when nothing is left (the Java code throws there).
 */
export function submittedReading(text: string): string {
  const t = text.trim();
  if (t === '') return '';
  try {
    return simulateInput(t);
  } catch {
    return '';
  }
}

/**
 * Answer field. For reading questions romaji is converted to kana by the core's port of the app's
 * TextWatcher (`PseudoIme.fixup` over the edited range, re-entrant like on Android) on every `input`
 * event, except while an IME composition is active (native Japanese keyboards): then we never touch
 * the value and convert once the composition ends. Each DOM edit is replayed into the core's
 * editable as a single replace of the changed range. The field is uncontrolled so React never
 * rewrites it mid-composition.
 */
export function AnswerInput({ reading, disabled, questionKey, onChange, onEnter, onImeEvent }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const readingRef = useRef(reading);
  readingRef.current = reading;
  const editable = useRef<SpanEditable | null>(null);
  const resetEditable = () => {
    editable.current = newAnswerEditable(new FixupWatcher(() => true, () => readingRef.current));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = '';
    resetEditable();
    composing.current = false;
    onChange('');
    el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionKey]);

  const convert = () => {
    const el = ref.current;
    if (!el) return;
    if (!editable.current) resetEditable();
    const ed = editable.current!;
    const before = ed.toString();
    const after = el.value;
    if (before !== after) {
      // The changed range: longest common prefix, then the longest common suffix after it.
      let p = 0;
      const max = Math.min(before.length, after.length);
      while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
      let q = 0;
      while (q < max - p && before.charCodeAt(before.length - 1 - q) === after.charCodeAt(after.length - 1 - q)) q++;
      // Cursor at the end of the edited range, so it moves with the inserted text as on Android.
      ed.setSelection(before.length - q);
      ed.replace(p, before.length - q, after.substring(p, after.length - q));
      const converted = ed.toString();
      if (converted !== after) {
        el.value = converted;
        const sel = Math.max(0, Math.min(ed.selectionEnd, converted.length));
        el.setSelectionRange(sel, sel);
      }
    }
    onChange(el.value);
  };

  return (
    <input
      ref={ref}
      className={`answer ${reading ? 'answer-reading' : ''}`}
      aria-label="Answer"
      type="text"
      lang={reading ? 'ja' : 'en'}
      placeholder={reading ? '答え' : 'Your answer'}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      enterKeyHint="done"
      readOnly={disabled}
      onCompositionStart={(e) => {
        composing.current = true;
        onImeEvent?.(`compositionstart "${e.data}"`);
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        onImeEvent?.(`compositionend "${e.data}"`);
        // Safari fires the final input before compositionend, Chrome after; convert in both cases.
        convert();
      }}
      onInput={(e) => {
        const ne = e.nativeEvent as InputEvent;
        if (composing.current || ne.isComposing) {
          onChange(e.currentTarget.value);
          return;
        }
        convert();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && !composing.current) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}
