package app.kanjikodama.wk;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Small secrets (the server-mode API token): AES-256-GCM with a key generated in, and never leaving,
 * the Android Keystore; the IV and ciphertext are stored in private SharedPreferences. Used by
 * {@link SecretsPlugin} (the app) and {@link BackgroundSyncWorker} (background sync).
 *
 * The prefs file is excluded from backups (res/xml/backup_rules.xml, data_extraction_rules.xml):
 * the Keystore key is device-bound, so a restored ciphertext could not be decrypted anyway.
 */
public final class SecretStore {
    static final String PREFS = "kk_secrets";
    private static final String KEY_ALIAS = "kanjikodama_secrets_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private SecretStore() {}

    private static SecretKey key() throws Exception {
        final KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        final KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        final KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return gen.generateKey();
    }

    private static SharedPreferences prefs(final Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized void set(final Context context, final String name, final String value) throws Exception {
        final Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        final byte[] ct = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        final String stored = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
        prefs(context).edit().putString(name, stored).commit();
    }

    /** The value, or null when absent or undecryptable (e.g. the key was lost). */
    public static synchronized String get(final Context context, final String name) {
        final String stored = prefs(context).getString(name, null);
        if (stored == null) {
            return null;
        }
        try {
            final int sep = stored.indexOf(':');
            final byte[] iv = Base64.decode(stored.substring(0, sep), Base64.NO_WRAP);
            final byte[] ct = Base64.decode(stored.substring(sep + 1), Base64.NO_WRAP);
            final Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
        } catch (final Exception e) {
            return null;
        }
    }

    public static synchronized void remove(final Context context, final String name) {
        prefs(context).edit().remove(name).commit();
    }
}
