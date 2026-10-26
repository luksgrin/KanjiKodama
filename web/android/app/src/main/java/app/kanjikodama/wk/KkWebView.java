package app.kanjikodama.wk;

import android.content.Context;
import android.os.LocaleList;
import android.text.InputType;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;

import com.getcapacitor.CapacitorWebView;

import java.util.Locale;
import java.util.Objects;

/**
 * Capacitor's WebView plus the IME settings HTML can't express. The Java app sets them on its answer
 * field (fragments/UnansweredSessionFragment) from the Keyboard input settings
 * (GlobalSettings.Keyboard):
 *
 * - imeOptions: IME_FLAG_NO_PERSONALIZED_LEARNING (`enable_no_learning`), IME_FLAG_FORCE_ASCII
 *   (`force_ascii_meaning` / `force_ascii_reading`), plus IME_FLAG_NO_FULLSCREEN;
 * - inputType: TYPE_CLASS_TEXT | TYPE_TEXT_FLAG_NO_SUGGESTIONS, with TYPE_TEXT_FLAG_AUTO_CORRECT
 *   (`enable_auto_correct_*`) and TYPE_TEXT_VARIATION_VISIBLE_PASSWORD (`force_visible_password_*`);
 * - hintLocales: English / Japanese (`ime_hint_meaning` / `ime_hint_reading`).
 *
 * The page reports which kind of field has focus with the values for it (SystemUiPlugin.setImeHints,
 * src/platform/androidSystemUi.ts + answerKeyboard.ts); they replace what Chromium put in the
 * EditorInfo it builds for that field. Other fields keep Chromium's EditorInfo. Used through
 * res/layout/capacitor_bridge_layout_main.xml, which overrides the layout of the same name in
 * @capacitor/android.
 */
public class KkWebView extends CapacitorWebView {
    /** The focused field's settings (`answerField` false: leave Chromium's EditorInfo alone). */
    public static final class ImeHints {
        final boolean answerField;
        final boolean noPersonalizedLearning;
        final boolean forceAscii;
        final boolean autoCorrect;
        final boolean visiblePassword;
        /** "en", "ja" or "" (no hint). */
        final String hintLocale;

        public ImeHints(final boolean answerField, final boolean noPersonalizedLearning, final boolean forceAscii,
                        final boolean autoCorrect, final boolean visiblePassword, final String hintLocale) {
            this.answerField = answerField;
            this.noPersonalizedLearning = noPersonalizedLearning;
            this.forceAscii = forceAscii;
            this.autoCorrect = autoCorrect;
            this.visiblePassword = visiblePassword;
            this.hintLocale = hintLocale == null ? "" : hintLocale;
        }

        @Override
        public boolean equals(final Object o) {
            if (!(o instanceof ImeHints)) return false;
            final ImeHints h = (ImeHints) o;
            return answerField == h.answerField && noPersonalizedLearning == h.noPersonalizedLearning
                    && forceAscii == h.forceAscii && autoCorrect == h.autoCorrect
                    && visiblePassword == h.visiblePassword && hintLocale.equals(h.hintLocale);
        }

        @Override
        public int hashCode() {
            return Objects.hash(answerField, noPersonalizedLearning, forceAscii, autoCorrect, visiblePassword, hintLocale);
        }
    }

    private static final ImeHints NONE = new ImeHints(false, false, false, false, false, "");

    private volatile ImeHints hints = NONE;

    public KkWebView(final Context context, final AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(final EditorInfo outAttrs) {
        final InputConnection ic = super.onCreateInputConnection(outAttrs);
        final ImeHints h = hints;
        if (ic != null && outAttrs != null && h.answerField) {
            // UnansweredSessionFragment.updateViews; Chromium's IME action (Go) is kept, as the answer
            // field submits on it.
            int imeOptions = outAttrs.imeOptions | EditorInfo.IME_FLAG_NO_FULLSCREEN;
            if (h.noPersonalizedLearning) imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;
            if (h.forceAscii) imeOptions |= EditorInfo.IME_FLAG_FORCE_ASCII;
            outAttrs.imeOptions = imeOptions;
            int inputType = InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;
            if (h.autoCorrect) inputType |= InputType.TYPE_TEXT_FLAG_AUTO_CORRECT;
            if (h.visiblePassword) inputType |= InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD;
            outAttrs.inputType = inputType;
            if (h.hintLocale.equals("en")) outAttrs.hintLocales = new LocaleList(Locale.ENGLISH);
            else if (h.hintLocale.equals("ja")) outAttrs.hintLocales = new LocaleList(Locale.JAPANESE);
        }
        return ic;
    }

    /**
     * Sets the settings for the focused field. Chromium may already have built the input connection
     * for it (the page's focus event and the IME request race), so restart it when they change.
     * Main thread.
     */
    public void setImeHints(final ImeHints next) {
        if (next.equals(hints)) return;
        hints = next;
        if (!hasFocus()) return;
        final InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null && imm.isActive(this)) imm.restartInput(this);
    }
}
