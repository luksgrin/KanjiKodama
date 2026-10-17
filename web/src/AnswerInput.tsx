import { useEffect, useRef } from 'react';
import { toHiraganaLive } from './kana/kanaConverter';

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
 * Answer field. For reading questions romaji is converted to hiragana on every `input` event,
 * except while an IME composition is active (native Japanese keyboards): then we never touch the
 * value and convert once the composition ends. The field is uncontrolled so React never rewrites
 * it mid-composition.
 */
export function AnswerInput({ reading, disabled, questionKey, onChange, onEnter, onImeEvent }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = '';
    composing.current = false;
    onChange('');
    el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionKey]);

  const convert = () => {
    const el = ref.current;
    if (!el) return;
    if (reading) {
      const converted = toHiraganaLive(el.value);
      if (converted !== el.value) {
        el.value = converted;
        el.setSelectionRange(converted.length, converted.length);
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
