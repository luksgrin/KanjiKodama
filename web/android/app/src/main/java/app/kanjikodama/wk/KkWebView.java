package app.kanjikodama.wk;

import android.content.Context;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;

import com.getcapacitor.CapacitorWebView;

/**
 * Capacitor's WebView plus the IME flags HTML can't express. The Java app sets them on its answer
 * field (fragments/UnansweredSessionFragment): IME_FLAG_NO_PERSONALIZED_LEARNING
 * (`enable_no_learning`, default on: the keyboard's incognito mode) and IME_FLAG_FORCE_ASCII for
 * meanings (`force_ascii_meaning`, default on). The page reports which kind of field has focus
 * (SystemUiPlugin.setImeHints, src/platform/androidSystemUi.ts); the flags are added to the
 * EditorInfo Chromium builds for it. Used through res/layout/capacitor_bridge_layout_main.xml,
 * which overrides the layout of the same name in @capacitor/android.
 */
public class KkWebView extends CapacitorWebView {
    private volatile boolean noPersonalizedLearning = false;
    private volatile boolean forceAscii = false;

    public KkWebView(final Context context, final AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(final EditorInfo outAttrs) {
        final InputConnection ic = super.onCreateInputConnection(outAttrs);
        if (ic != null && outAttrs != null) {
            if (noPersonalizedLearning) outAttrs.imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;
            if (forceAscii) outAttrs.imeOptions |= EditorInfo.IME_FLAG_FORCE_ASCII;
        }
        return ic;
    }

    /**
     * Sets the flags for the focused field. Chromium may already have built the input connection
     * for it (the page's focus event and the IME request race), so restart it when they change.
     * Main thread.
     */
    public void setImeHints(final boolean noLearning, final boolean ascii) {
        if (noLearning == noPersonalizedLearning && ascii == forceAscii) return;
        noPersonalizedLearning = noLearning;
        forceAscii = ascii;
        if (!hasFocus()) return;
        final InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null && imm.isActive(this)) imm.restartInput(this);
    }
}
