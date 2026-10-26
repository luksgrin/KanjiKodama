/**
 * The quiz answer field (`UnansweredSessionFragment.questionEdit`). For reading questions romaji becomes
 * kana through the core's port of the app's TextWatcher (`PseudoIme.fixup` over the edited range,
 * re-entrant like on Android, `core/kana/answerField.ts`).
 *
 * Keyboards differ a lot, so nothing here relies on key codes:
 * - IME composition (iOS Japanese, Gboard and SwiftKey word suggestions, Samsung Keyboard even for Latin
 *   text): the value is never touched while composing (`compositionstart`..`compositionend`,
 *   `InputEvent.isComposing`); the converted text is written once the composition ends, and Submit converts
 *   whatever is left over, so a keyboard that composes until the very end still gets kana.
 * - Enter / Go / Done: the field sits in a `<form>`, so the browser's implicit submission handles every
 *   keyboard's action key (Android keyboards send keyCode 229 on keydown); `insertLineBreak` /
 *   `insertParagraph` beforeinput events count too. An Enter that only commits a composition doesn't submit.
 * - The field is uncontrolled (React never rewrites it mid-composition); `lang="ja"` on reading fields;
 *   the keyboard attributes follow the Keyboard input settings (`answerInputAttributes`: no
 *   autocorrect/autocapitalize/spellcheck by default, Java's `TYPE_TEXT_FLAG_NO_SUGGESTIONS`).
 * - While a session dialog is open the field doesn't submit (the dialog has Java's input focus).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, type FormEvent } from 'react';
import { FixupWatcher, newAnswerEditable, type SpanEditable } from '../../../core/kana';
import type { AnswerInputAttributes } from './displayPrefs';
import { sessionDialogOpen } from './SessionDialog';

export interface AnswerFieldHandle {
  /** The field's text with any unconverted romaji converted (reading questions); what Submit sends. */
  commit(): string;
  focus(): void;
}

export interface AnswerFieldProps {
  /** A reading question: romaji → kana, `lang="ja"`. */
  kana: boolean;
  /** Java `Question.getHint(false)`: "答え" for readings, "Your response" for meanings. */
  placeholder: string;
  /** `question.getTitle()` (the field's accessible name, like Java's content description). */
  label: string;
  /** Changes for every new question: clears the field and focuses it. */
  questionKey: string;
  /** The text to start with (`FloatingUiState.getCurrentAnswer`). */
  initial?: string;
  readOnly?: boolean;
  /** Center the text (`center_caret`). */
  centered?: boolean;
  /** Font size in px (`font_size_question_edit`). */
  fontSize?: number;
  /** Keyboard attributes (Keyboard input settings); default: Java's defaults for the question kind. */
  input?: AnswerInputAttributes;
  onChange(text: string): void;
  onSubmit(): void;
}

/** Replays a DOM edit into the editable as one replace of the changed range; returns the converted text. */
export function replayEdit(ed: SpanEditable, after: string): string {
  const before = ed.toString();
  if (before === after) return before;
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
  let q = 0;
  while (q < max - p && before.charCodeAt(before.length - 1 - q) === after.charCodeAt(after.length - 1 - q)) q++;
  // Cursor at the end of the edited range, so it moves with the inserted text as on Android.
  ed.setSelection(before.length - q);
  ed.replace(p, before.length - q, after.substring(p, after.length - q));
  return ed.toString();
}

export const AnswerField = forwardRef<AnswerFieldHandle, AnswerFieldProps>(function AnswerField(
  { kana, placeholder, label, questionKey, initial = '', readOnly = false, centered = false, fontSize, input: attrs, onChange, onSubmit },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const kanaRef = useRef(kana);
  kanaRef.current = kana;
  const editable = useRef<SpanEditable | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const freshEditable = (text: string): SpanEditable =>
    newAnswerEditable(new FixupWatcher(() => true, () => kanaRef.current), text);

  /** Converts the field's current value (outside composition) and writes it back if it changed. */
  const convert = (): string => {
    const el = input.current;
    if (el === null) return '';
    editable.current ??= freshEditable('');
    const after = el.value;
    const converted = replayEdit(editable.current, after);
    if (converted !== after) {
      el.value = converted;
      const sel = Math.max(0, Math.min(editable.current.selectionEnd, converted.length));
      try {
        el.setSelectionRange(sel, sel);
      } catch {
        // not focusable right now
      }
    }
    onChangeRef.current(el.value);
    return el.value;
  };

  useEffect(() => {
    const el = input.current;
    if (el === null) return;
    el.value = initial;
    editable.current = freshEditable(initial);
    composing.current = false;
    onChangeRef.current(initial);
    if (!readOnly) el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionKey]);

  useImperativeHandle(ref, () => ({
    commit() {
      composing.current = false;
      return convert();
    },
    focus() {
      input.current?.focus({ preventScroll: true });
    },
  }));

  const submit = (e?: FormEvent): void => {
    e?.preventDefault();
    if (readOnly) return;
    // The Enter that ends a composition (Safari fires keydown/submit before compositionend) only commits it.
    if (composing.current) return;
    if (sessionDialogOpen()) return;
    onSubmit();
  };

  return (
    <form className="kk-answer-form" onSubmit={submit} action="#" noValidate>
      <input
        ref={input}
        className={`kk-answer${kana ? ' kana' : ''}${centered ? ' centered' : ''}`}
        style={fontSize !== undefined ? { fontSize } : undefined}
        aria-label={label}
        type="text"
        name="answer"
        lang={attrs?.lang ?? (kana ? 'ja' : 'en')}
        placeholder={placeholder}
        autoComplete={attrs?.autoComplete ?? 'off'}
        autoCorrect={attrs?.autoCorrect ?? 'off'}
        autoCapitalize={attrs?.autoCapitalize ?? 'none'}
        spellCheck={attrs?.spellCheck ?? false}
        inputMode={attrs?.inputMode ?? 'text'}
        enterKeyHint="done"
        readOnly={readOnly}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          // Chrome fires the last input after compositionend, Safari before; convert in both cases.
          convert();
        }}
        onBeforeInput={(e) => {
          const ne = e.nativeEvent as InputEvent;
          if ((ne.inputType === 'insertLineBreak' || ne.inputType === 'insertParagraph') && !ne.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        onInput={(e) => {
          const ne = e.nativeEvent as InputEvent;
          if (composing.current || ne.isComposing) {
            onChangeRef.current(e.currentTarget.value);
            return;
          }
          convert();
        }}
        onKeyDown={(e) => {
          // Tab never leaves the field (`swallowFocusKey`).
          if (e.key === 'Tab') e.preventDefault();
        }}
      />
      <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
    </form>
  );
});
