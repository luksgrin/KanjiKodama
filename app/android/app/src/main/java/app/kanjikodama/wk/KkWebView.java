package app.kanjikodama.wk;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.os.Bundle;
import android.os.Handler;
import android.os.LocaleList;
import android.os.Looper;
import android.os.ResultReceiver;
import android.os.SystemClock;
import android.text.InputType;
import android.util.AttributeSet;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewParent;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;

import androidx.annotation.NonNull;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.CapacitorWebView;

import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * Capacitor's WebView plus the IME settings HTML can't express, set on the answer field from the
 * Keyboard input settings:
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
 *
 * Keep keyboard (setKeepKeyboard, src/ui/components/session/nativeKeepKeyboard.ts): while the
 * unanswered question shows with its answer field focused, a keyboard that goes away because of a
 * touch on the page (or because the page lost the field's focus and took it back) is shown again at
 * once; see {@link #onImeVisibility}. A dismissal by the user (Back, the keyboard's own hide key: the
 * IME hides without a touch on the page) is respected until the keyboard is shown again (a tap on
 * the field). Diagnostics (setImeDiagnostics): the events behind it, for Settings → About → Keyboard
 * diagnostics.
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

    /** Receives the keyboard diagnostics events (main thread). */
    public interface ImeLog {
        void log(String event, String detail);
    }

    /** A touch that ended this long before the keyboard hides still caused the hide (a tap's mouse events, a long press's end). */
    private static final long TOUCH_TAIL_MS = 800;
    /** A Back key this long before the hide made it. */
    private static final long BACK_MS = 1000;
    /** The page took the focus back this long before or after the hide (`reshowKeyboard`). */
    private static final long PAGE_REQUEST_MS = 1000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private ImeLog imeLog;
    private boolean keepKeyboard = false;
    private boolean paused = false;
    private boolean imeVisible = false;
    /** The user hid the keyboard (Back, its hide key): no re-show until it shows again. */
    private boolean dismissed = false;
    private long dismissedAt = -1;
    private boolean touching = false;
    private long touchEndAt = -1;
    private long backAt = -1;
    private long pageRequestAt = -1;
    private long hiddenAt = -1;
    private long reshowAt = -1;
    private boolean insetsWatched = false;

    public KkWebView(final Context context, final AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(final EditorInfo outAttrs) {
        final InputConnection ic = super.onCreateInputConnection(outAttrs);
        if (imeLog != null) log("input-connection", ic == null ? "none (no editable focus)" : "editor type=0x" + Integer.toHexString(outAttrs.inputType));
        final ImeHints h = hints;
        if (ic != null && outAttrs != null && h.answerField) {
            // The answer field's flags; Chromium's IME action (Go) is kept, as the answer
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

    // ---- Keep keyboard -----------------------------------------------------------------------

    /** The diagnostics sink, or null (off). Main thread. */
    public void setImeLog(final ImeLog log) {
        imeLog = log;
        if (log != null) log("diagnostics", "on; ime " + (readImeVisible() ? "shown" : "hidden") + ", keep " + keepKeyboard
                + ", webview focus " + hasFocus() + ", window focus " + hasWindowFocus());
    }

    private void log(final String event, final String detail) {
        final ImeLog l = imeLog;
        if (l != null) l.log(event, detail);
    }

    /** The page's keep-keyboard mode (on: the unanswered question with its field focused). Main thread. */
    public void setKeepKeyboard(final boolean on) {
        watchInsets();
        if (on == keepKeyboard) return;
        keepKeyboard = on;
        imeVisible = readImeVisible();
        if (!on && dismissed) {
            dismissed = false;
            tellPageDismissed(false);
        }
        log("keep", on ? "on (ime " + (imeVisible ? "shown" : "hidden") + ")" : "off");
    }

    /** Activity paused / resumed: no re-show while paused (the system hides the keyboard). */
    public void setPaused(final boolean p) {
        paused = p;
        log("activity", p ? "paused" : "resumed");
    }

    /**
     * The page lost the answer field's focus without the user moving it (a blur from script, a
     * re-render) and took it back: Chromium hid the keyboard for the blur and won't show it for a
     * focus outside a tap, so show it again unless the user hid it.
     */
    public void requestReshow() {
        final long now = SystemClock.uptimeMillis();
        pageRequestAt = now;
        log("keep", "page took the focus back");
        if (!canReshow()) return;
        if (dismissed && !(dismissedAt >= 0 && now - dismissedAt < PAGE_REQUEST_MS && now - backAt >= BACK_MS)) return;
        dismissed = false;
        showIme("page request");
        // The hide for the blur may still be on its way: look again once it has landed.
        main.postDelayed(() -> {
            if (canReshow() && !dismissed && !readImeVisible()) showIme("page request, again");
        }, 120);
    }

    private boolean canReshow() {
        return keepKeyboard && !paused && hasWindowFocus();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        watchInsets();
    }

    /**
     * The keyboard's visibility from two sources: the inset animation's start (the earliest, before
     * the first frame of the hide) and the insets dispatched to this view (no animation: API < 30,
     * animations off). The animation callback sits on the parent so that it doesn't replace one the
     * WebView may set on itself, and lets the dispatch continue to it.
     */
    private void watchInsets() {
        if (insetsWatched) return;
        final ViewParent p = getParent();
        if (!(p instanceof View)) return;
        insetsWatched = true;
        ViewCompat.setWindowInsetsAnimationCallback((View) p, new WindowInsetsAnimationCompat.Callback(
                WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            @NonNull
            @Override
            public WindowInsetsAnimationCompat.BoundsCompat onStart(@NonNull final WindowInsetsAnimationCompat animation,
                                                                    @NonNull final WindowInsetsAnimationCompat.BoundsCompat bounds) {
                if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) {
                    if (imeLog != null) log("ime-animation", "start, ends " + (readImeVisible() ? "shown" : "hidden") + ", " + animation.getDurationMillis() + " ms");
                    onImeVisibility(readImeVisible(), "animation start");
                }
                return bounds;
            }

            @Override
            public void onPrepare(@NonNull final WindowInsetsAnimationCompat animation) {
                if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0 && imeLog != null) log("ime-animation", "prepare");
            }

            @NonNull
            @Override
            public WindowInsetsCompat onProgress(@NonNull final WindowInsetsCompat insets,
                                                 @NonNull final List<WindowInsetsAnimationCompat> running) {
                return insets;
            }

            @Override
            public void onEnd(@NonNull final WindowInsetsAnimationCompat animation) {
                if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) onImeVisibility(readImeVisible(), "animation end");
            }
        });
    }

    @Override
    public WindowInsets onApplyWindowInsets(final WindowInsets insets) {
        final WindowInsets out = super.onApplyWindowInsets(insets);
        if (insets != null) {
            final boolean v = WindowInsetsCompat.toWindowInsetsCompat(insets, this).isVisible(WindowInsetsCompat.Type.ime());
            onImeVisibility(v, "insets");
        }
        return out;
    }

    private boolean readImeVisible() {
        final WindowInsetsCompat w = ViewCompat.getRootWindowInsets(this);
        return w != null && w.isVisible(WindowInsetsCompat.Type.ime());
    }

    /**
     * The keyboard went from shown to hidden (or back). While the keep mode is on, a hide is the
     * user's unless a touch on the page is going on or just ended (Chromium's reaction to a tap or a
     * long press beside the field: the case this is for) or the page reported a lost focus it took
     * back; a touch the system took over (pointer pilfered: the back gesture) doesn't count, nor does
     * any hide within a second of a Back key. The user's hide is kept until the keyboard shows again.
     */
    private void onImeVisibility(final boolean visible, final String via) {
        if (visible == imeVisible) return;
        imeVisible = visible;
        final long now = SystemClock.uptimeMillis();
        if (visible) {
            final String lag = hiddenAt >= 0 && reshowAt >= hiddenAt ? ", " + (now - hiddenAt) + " ms after the hide" : "";
            log("ime", "shown (" + via + lag + ")");
            if (dismissed) tellPageDismissed(false);
            dismissed = false;
            hiddenAt = -1;
            return;
        }
        hiddenAt = now;
        log("ime", "hidden (" + via + "; touching " + touching + ", touch ended " + ago(touchEndAt, now)
                + ", back " + ago(backAt, now) + ", webview focus " + hasFocus() + ", window focus " + hasWindowFocus() + ")");
        if (!canReshow()) return;
        if (backAt >= 0 && now - backAt < BACK_MS) {
            dismiss("Back", now);
            return;
        }
        final boolean afterTouch = touching || (touchEndAt >= 0 && now - touchEndAt < TOUCH_TAIL_MS);
        final boolean pageAsked = pageRequestAt >= 0 && now - pageRequestAt < PAGE_REQUEST_MS;
        if (!afterTouch && !pageAsked) {
            dismiss("no touch on the page (the keyboard's hide key or the back gesture)", now);
            return;
        }
        if (dismissed) return;
        // Not inside the insets dispatch: a show from there cancels the hide animation while
        // InsetsController is starting it ("Can't change insets on an animation that is cancelled",
        // a crash seen on kk-golden2). Right after it, in the same main-loop turn's queue.
        final String why = afterTouch ? "after a touch" : "page request";
        main.postAtFrontOfQueue(() -> {
            if (canReshow() && !dismissed && !readImeVisible()) showIme(why);
        });
    }

    private void dismiss(final String why, final long now) {
        dismissed = true;
        dismissedAt = now;
        log("keep", "user hid the keyboard: " + why + "; stays hidden until the field is tapped");
        tellPageDismissed(true);
    }

    /**
     * Chromium shows the keyboard again for any tap on the page while a field has the focus
     * (WebFrameWidgetImpl::DidHandleGestureEvent, GestureTap); after the user hid it, the page keeps
     * it hidden until the field itself is tapped (`window.kkKeyboardDismissed`, nativeKeepKeyboard.ts).
     */
    private void tellPageDismissed(final boolean d) {
        evaluateJavascript("typeof window.kkKeyboardDismissed==='function'&&window.kkKeyboardDismissed(" + d + ")", null);
    }

    private static String ago(final long t, final long now) {
        return t < 0 ? "never" : (now - t) + " ms ago";
    }

    /**
     * Shows the keyboard for this view: at once when Chromium still has an editor for the field
     * (only the keyboard went away), and again once the page has made sure its field has the focus
     * (`window.kkKeepAnswer`, nativeKeepKeyboard.ts).
     */
    private void showIme(final String why) {
        reshowAt = SystemClock.uptimeMillis();
        if (!hasFocus()) {
            log("keep", "webview had lost the view focus: requestFocus");
            requestFocus();
        }
        final InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        final boolean active = imm != null && imm.isActive(this);
        boolean sent = false;
        if (active) sent = imm.showSoftInput(this, 0, new ResultReceiver(main) {
            @Override
            protected void onReceiveResult(final int resultCode, final Bundle resultData) {
                log("keep", "showSoftInput result " + resultCode);
            }
        });
        log("keep", "re-show (" + why + "): showSoftInput " + (active ? (sent ? "sent" : "refused") : "skipped (no editor)"));
        evaluateJavascript("typeof window.kkKeepAnswer==='function'&&window.kkKeepAnswer()", (v) -> {
            if (!"true".equals(v)) {
                log("keep", "page: answer field not focused (" + v + "), no re-show");
                return;
            }
            if (!canReshow() || dismissed || readImeVisible()) return;
            final InputMethodManager m = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            final boolean ok = m != null && m.isActive(this) && m.showSoftInput(this, 0);
            if (!ok) {
                final Activity a = activity();
                if (a != null) WindowCompat.getInsetsController(a.getWindow(), this).show(WindowInsetsCompat.Type.ime());
            }
            log("keep", "re-show after the page refocused: " + (ok ? "showSoftInput" : "insets controller"));
        });
    }

    private Activity activity() {
        Context c = getContext();
        while (c instanceof ContextWrapper) {
            if (c instanceof Activity) return (Activity) c;
            c = ((ContextWrapper) c).getBaseContext();
        }
        return null;
    }

    @Override
    public boolean dispatchTouchEvent(final MotionEvent ev) {
        final int a = ev.getActionMasked();
        if (a == MotionEvent.ACTION_DOWN) {
            touching = true;
            log("touch", "down " + Math.round(ev.getX()) + "," + Math.round(ev.getY()) + " tool " + ev.getToolType(0));
        } else if (a == MotionEvent.ACTION_UP) {
            touching = false;
            touchEndAt = SystemClock.uptimeMillis();
            log("touch", "up after " + (ev.getEventTime() - ev.getDownTime()) + " ms");
        } else if (a == MotionEvent.ACTION_CANCEL) {
            // The system took the pointer (the back gesture, a system swipe): not a touch on the page.
            touching = false;
            touchEndAt = -1;
            log("touch", "cancel");
        }
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public boolean onKeyPreIme(final int keyCode, final KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            backAt = SystemClock.uptimeMillis();
            log("key", "back " + (event.getAction() == KeyEvent.ACTION_DOWN ? "down" : "up") + " (ime " + (readImeVisible() ? "shown" : "hidden") + ")");
        }
        return super.onKeyPreIme(keyCode, event);
    }

    @Override
    protected void onFocusChanged(final boolean gainFocus, final int direction, final android.graphics.Rect previouslyFocusedRect) {
        super.onFocusChanged(gainFocus, direction, previouslyFocusedRect);
        log("view-focus", gainFocus ? "gained" : "lost");
    }

    @Override
    public void onWindowFocusChanged(final boolean hasWindowFocus) {
        super.onWindowFocusChanged(hasWindowFocus);
        log("window-focus", hasWindowFocus ? "gained" : "lost");
    }
}
