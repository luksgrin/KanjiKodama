package app.kanjikodama.wk;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Vocab audio playback as the Java app's `AudioUtil.playAudioPost26` does it (src/platform/androidAudio.ts):
 * a MediaPlayer with speech audio attributes, and with `use_audio_focus` (default true) a transient
 * "may duck" audio focus request first (other players pause or lower their volume; playback stops
 * when the focus is lost; no playback when it is refused), abandoned 1.5 s after the end. Without
 * it, other players keep playing. A WebView &lt;audio&gt; element can't choose: Chromium handles focus
 * by itself.
 */
@CapacitorPlugin(name = "KkAudio")
public class KkAudioPlugin extends Plugin {
    private MediaPlayer current;
    private Runnable currentRelease;

    @PluginMethod
    public void play(final PluginCall call) {
        final String src = call.getString("src");
        final boolean useFocus = Boolean.TRUE.equals(call.getBoolean("audioFocus", true));
        if (src == null || src.isEmpty()) {
            call.reject("No source");
            return;
        }
        final Context context = getContext();
        final AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        stopCurrent();
        final MediaPlayer player = new MediaPlayer();
        current = player;
        final AudioAttributes attributes = new AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
        final Object[] request = { null };
        final Runnable release = () -> {
            try { player.reset(); } catch (final Exception e) { /* already released */ }
            try { player.release(); } catch (final Exception e) { /* already released */ }
            try { abandon(audioManager, request[0]); } catch (final Exception e) { /* nothing held */ }
            if (current == player) { current = null; currentRelease = null; }
        };
        currentRelease = release;
        try {
            player.setAudioAttributes(attributes);
            player.setDataSource(context, Uri.parse(src));
            player.setOnPreparedListener(mp -> {
                if (useFocus && audioManager != null) {
                    request[0] = requestFocus(audioManager, attributes, player);
                    if (request[0] == null) {
                        release.run();
                        final JSObject ret = new JSObject();
                        ret.put("played", false);
                        call.resolve(ret);
                        return;
                    }
                }
                player.setOnCompletionListener(done -> new Handler(Looper.getMainLooper()).postDelayed(release, 1500));
                player.start();
                final JSObject ret = new JSObject();
                ret.put("played", true);
                call.resolve(ret);
            });
            player.setOnErrorListener((mp, what, extra) -> {
                release.run();
                call.reject("Playback failed (" + what + ", " + extra + ")");
                return true;
            });
            player.prepareAsync();
        } catch (final Exception e) {
            release.run();
            call.reject("Playback failed: " + e.getMessage(), e);
        }
    }

    /** A new word stops the previous one (`htmlAudioPlayer` did the same) and releases it. */
    private void stopCurrent() {
        final Runnable r = currentRelease;
        if (r != null) r.run();
        current = null;
        currentRelease = null;
    }

    /** The granted request (an AudioFocusRequest, or the listener below Android 8), null when refused. */
    private static Object requestFocus(final AudioManager am, final AudioAttributes attributes, final MediaPlayer player) {
        final AudioManager.OnAudioFocusChangeListener listener = change -> {
            if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
                    || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                try { player.stop(); } catch (final Exception e) { /* released */ }
            }
        };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            final AudioFocusRequest r = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(listener)
                    .build();
            return am.requestAudioFocus(r) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED ? r : null;
        }
        @SuppressWarnings("deprecation")
        final int result = am.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED ? listener : null;
    }

    @SuppressWarnings("deprecation")
    private static void abandon(final AudioManager am, final Object request) {
        if (am == null || request == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && request instanceof AudioFocusRequest) {
            am.abandonAudioFocusRequest((AudioFocusRequest) request);
        } else if (request instanceof AudioManager.OnAudioFocusChangeListener) {
            am.abandonAudioFocus((AudioManager.OnAudioFocusChangeListener) request);
        }
    }
}
