package app.kanjikodama.wk;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * `LegacyMigration` (src/platform/androidLegacy.ts): the one-time move from the Java app (issue #3,
 * step 6, option B). The Capacitor app installs over the Java app with the same id and key, so the
 * Java app's private files are still there:
 *
 * <ul>
 *   <li>the Room database {@code databases/wanikani} (Room version 68): {@link #exportProgress} copies it
 *   (with its -wal / -shm files) to the cache dir, opens the copy and runs the queries of Java
 *   {@code ProgressStore.export()}, returning the same JSON text (Android's org.json,
 *   {@code toString(1)}). The original database is never opened, so it can't be changed;</li>
 *   <li>the default SharedPreferences ({@code <package>_preferences}): {@link #exportSettings} returns
 *   them in the settings backup format ({@code GlobalSettings.getAllSettings} through Gson:
 *   {@code {"key": {"value": "…", "type": "Boolean"}}}, src/progress/settingsBackup.ts), without the
 *   encrypted keys;</li>
 *   <li>the API token in {@code EncryptedSharedPreferences} "encrypted_shared_prefs" (master key
 *   {@code _androidx_security_master_key_} in the Android Keystore, same uid): {@link #readToken}.</li>
 * </ul>
 *
 * {@link #removeOldData} deletes all three (only when the learner asks for it). {@link #moveAudio} moves
 * the pronunciation audio the Java app downloaded into the new app's audio directory, so it isn't
 * downloaded again (same layout: {@code pronunciation-audio/<level>/<sourceId>.mp3|ogg}).
 */
@CapacitorPlugin(name = "LegacyMigration")
public class LegacyMigrationPlugin extends Plugin {
    static final String DB_NAME = "wanikani";
    static final String ENCRYPTED_PREFS = "encrypted_shared_prefs";
    static final String MASTER_KEY_ALIAS = "_androidx_security_master_key_";
    static final String FORMAT = "kanjikodama-progress";
    static final int VERSION = 1;
    /** `Constants.AUDIO_DIRECTORY_NAME`, also the new app's `AUDIO_DIR` (src/core/audio). */
    static final String AUDIO_DIR = "pronunciation-audio";
    /** Settings that the Java app keeps encrypted; never part of the settings export. */
    private static final String[] SECRET_KEYS = {"api_key", "web_password"};

    /** `ProgressStore.NUMERIC`. */
    private static final String[] NUMERIC = {
            "availableAt", "burnedAt", "passedAt", "resurrectedAt", "startedAt", "unlockedAt", "srsStage",
            "lastIncorrectAnswer", "assignmentId", "studyMaterialId", "reviewStatisticId",
            "meaningCorrect", "meaningIncorrect", "meaningMaxStreak", "meaningCurrentStreak",
            "readingCorrect", "readingIncorrect", "readingMaxStreak", "readingCurrentStreak",
            "percentageCorrect", "leechScore", "levelProgressScore",
            "passed", "resurrected", "assignmentPatched", "studyMaterialPatched", "statisticPatched",
    };
    /** `ProgressStore.TEXT`. */
    private static final String[] TEXT = {"meaningNote", "meaningSynonyms", "readingNote"};
    /** `ProgressStore.LEVEL_PROGRESSION`. */
    private static final String[] LEVEL_PROGRESSION = {
            "id", "level", "abandonedAt", "completedAt", "createdAt", "passedAt", "startedAt", "unlockedAt",
    };

    private Context ctx() {
        return getContext().getApplicationContext();
    }

    private String defaultPrefsName() {
        return ctx().getPackageName() + "_preferences";
    }

    private File prefsFile(final String name) {
        return new File(new File(ctx().getApplicationInfo().dataDir, "shared_prefs"), name + ".xml");
    }

    /** What the Java app left behind. */
    @PluginMethod
    public void probe(final PluginCall call) {
        final File db = ctx().getDatabasePath(DB_NAME);
        final JSObject ret = new JSObject();
        ret.put("database", db.isFile());
        ret.put("settings", prefsFile(defaultPrefsName()).isFile());
        ret.put("encryptedSettings", prefsFile(ENCRYPTED_PREFS).isFile());
        call.resolve(ret);
    }

    /** `ProgressStore.export()` over a copy of the old database. */
    @PluginMethod
    public void exportProgress(final PluginCall call) {
        final File src = ctx().getDatabasePath(DB_NAME);
        if (!src.isFile()) {
            call.reject("The old app's database was not found.", "NOT_FOUND");
            return;
        }
        final File dir = new File(ctx().getCacheDir(), "legacy-migration");
        try {
            deleteTree(dir);
            if (!dir.mkdirs()) throw new IllegalStateException("cannot create " + dir);
            final File copy = new File(dir, DB_NAME);
            copyFile(src, copy);
            for (final String suffix: new String[] {"-wal", "-shm", "-journal"}) {
                final File f = new File(src.getPath() + suffix);
                if (f.isFile()) copyFile(f, new File(copy.getPath() + suffix));
            }
            // The copy is opened read-write so SQLite can replay its WAL; the original stays untouched.
            final String json;
            final int roomVersion;
            try (SQLiteDatabase sql = SQLiteDatabase.openDatabase(copy.getPath(), null, SQLiteDatabase.OPEN_READWRITE)) {
                roomVersion = (int) longQuery(sql, "PRAGMA user_version", 0);
                json = export(sql);
            }
            final JSObject ret = new JSObject();
            ret.put("json", json);
            ret.put("roomVersion", roomVersion);
            call.resolve(ret);
        } catch (final Exception e) {
            call.reject("Could not read the old app's database: " + e.getMessage(), e);
        } finally {
            deleteTree(dir);
        }
    }

    static String export(final SQLiteDatabase sql) throws Exception {
        final JSONObject root = new JSONObject();
        root.put("format", FORMAT);
        root.put("version", VERSION);
        root.put("exportedAt", System.currentTimeMillis());
        root.put("userLevel", userLevel(sql));

        final JSONArray levels = new JSONArray();
        final List<String> lpCols = existing(sql, "level_progression", LEVEL_PROGRESSION);
        if (!lpCols.isEmpty()) {
            try (Cursor c = sql.rawQuery("SELECT " + join(lpCols) + " FROM level_progression ORDER BY level", null)) {
                while (c.moveToNext()) levels.put(row(c, lpCols));
            }
        }
        root.put("levelProgression", levels);

        final List<String> cols = new ArrayList<>(existing(sql, "subject", NUMERIC));
        cols.addAll(existing(sql, "subject", TEXT));
        cols.add(0, "id");
        final JSONArray subjects = new JSONArray();
        try (Cursor c = sql.rawQuery("SELECT " + join(cols) + " FROM subject WHERE unlockedAt != 0 OR meaningNote IS NOT NULL"
                + " OR meaningSynonyms IS NOT NULL OR readingNote IS NOT NULL OR meaningCorrect + meaningIncorrect + readingCorrect + readingIncorrect > 0", null)) {
            while (c.moveToNext()) subjects.put(row(c, cols));
        }
        root.put("subjects", subjects);

        // Curriculum.getMode(): mm_state "mode", WANIKANI unless it says JLPT (the tables may not exist yet).
        String mode = null;
        if (tableExists(sql, "mm_state")) {
            try (Cursor c = sql.rawQuery("SELECT value FROM mm_state WHERE key = ?", new String[] {"mode"})) {
                if (c.moveToFirst()) mode = c.getString(0);
            }
        }
        root.put("curriculum", "JLPT".equals(mode) ? "JLPT" : "WANIKANI");
        final JSONArray probation = new JSONArray();
        if (tableExists(sql, "mm_probation")) {
            try (Cursor c = sql.rawQuery("SELECT id, since FROM mm_probation ORDER BY id", null)) {
                while (c.moveToNext()) probation.put(new JSONArray().put(c.getLong(0)).put(c.getLong(1)));
            }
        }
        root.put("probation", probation);
        final JSONArray jumps = new JSONArray();
        if (tableExists(sql, "mm_jump")) {
            try (Cursor c = sql.rawQuery("SELECT at, fromLevel, toLevel FROM mm_jump ORDER BY at", null)) {
                while (c.moveToNext()) jumps.put(new JSONArray().put(c.getLong(0)).put(c.getInt(1)).put(c.getInt(2)));
            }
        }
        root.put("jumps", jumps);
        return root.toString(1);
    }

    /** `PropertiesDao.getUserLevel()`: the "user_level" property, 0 when missing or not a number. */
    private static int userLevel(final SQLiteDatabase sql) {
        if (!tableExists(sql, "properties")) return 0;
        try (Cursor c = sql.rawQuery("SELECT value FROM properties WHERE name = ?", new String[] {"user_level"})) {
            if (!c.moveToFirst() || c.isNull(0)) return 0;
            try {
                return Integer.parseInt(c.getString(0), 10);
            } catch (final NumberFormatException e) {
                return 0;
            }
        }
    }

    /** The Java app's settings in the settings backup format, plus the server connection. */
    @PluginMethod
    public void exportSettings(final PluginCall call) {
        try {
            final JSObject ret = new JSObject();
            if (!prefsFile(defaultPrefsName()).isFile()) {
                ret.put("found", false);
                call.resolve(ret);
                return;
            }
            final SharedPreferences prefs = ctx().getSharedPreferences(defaultPrefsName(), Context.MODE_PRIVATE);
            final JSONObject out = new JSONObject();
            int skipped = 0;
            for (final Map.Entry<String, ?> e: prefs.getAll().entrySet()) {
                final Object v = e.getValue();
                if (v == null || isSecret(e.getKey())) continue;
                final String type = v.getClass().getSimpleName();
                if (!(v instanceof Boolean || v instanceof Integer || v instanceof Long || v instanceof Float || v instanceof String)) {
                    skipped++; // e.g. a string set: the settings backup can't restore it either
                    continue;
                }
                out.put(e.getKey(), new JSONObject().put("value", v.toString()).put("type", type));
            }
            ret.put("found", true);
            ret.put("text", out.toString());
            ret.put("skipped", skipped);
            ret.put("serverMode", prefs.getBoolean("kanjikodama_server_mode", false));
            final String baseUrl = prefs.getString("api_base_url", null);
            ret.put("baseUrl", baseUrl == null ? JSObject.NULL : baseUrl);
            call.resolve(ret);
        } catch (final Exception e) {
            call.reject("Could not read the old app's settings: " + e.getMessage(), e);
        }
    }

    private static boolean isSecret(final String key) {
        for (final String s: SECRET_KEYS) {
            if (s.equals(key)) return true;
        }
        return false;
    }

    /**
     * `GlobalSettings.Api.getApiKey()`: the token from EncryptedSharedPreferences (or, from very old
     * versions, a plain value in the default preferences). Null when there is none or it can't be
     * decrypted (then the learner enters it again).
     */
    @PluginMethod
    public void readToken(final PluginCall call) {
        final JSObject ret = new JSObject();
        String token = null;
        String error = null;
        if (prefsFile(ENCRYPTED_PREFS).isFile()) {
            try {
                final MasterKey masterKey = new MasterKey.Builder(ctx(), MasterKey.DEFAULT_MASTER_KEY_ALIAS)
                        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                        .build();
                final SharedPreferences enc = EncryptedSharedPreferences.create(ctx(), ENCRYPTED_PREFS, masterKey,
                        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
                token = enc.getString("api_key", null);
            } catch (final Exception e) {
                error = e.getClass().getSimpleName();
            }
        }
        if (token == null && prefsFile(defaultPrefsName()).isFile()) {
            final String plain = ctx().getSharedPreferences(defaultPrefsName(), Context.MODE_PRIVATE).getString("api_key", null);
            if (plain != null && !plain.startsWith("enc:")) token = plain;
        }
        if (token != null) {
            token = token.replaceAll("\\s+", ""); // GlobalSettings.blankTrimPattern
            if (token.isEmpty()) token = null;
        }
        ret.put("token", token == null ? JSObject.NULL : token);
        ret.put("error", error == null ? JSObject.NULL : error);
        call.resolve(ret);
    }

    /**
     * The Java app's downloaded audio (`AudioUtil`): {@code no_backup/pronunciation-audio} ("Internal",
     * its default) and {@code pronunciation-audio} in every external files dir (the other "Audio
     * location" choices; plus the stored `audio_location` path). Moved file by file into
     * {@code files/pronunciation-audio} (src/platform/androidAudio.ts), renamed on the same file
     * system, copied and deleted otherwise. Files the new app already has are kept and the old copy
     * deleted. Empty old directories are removed.
     */
    @PluginMethod
    public void moveAudio(final PluginCall call) {
        final File target = new File(ctx().getFilesDir(), AUDIO_DIR);
        final List<File> sources = new ArrayList<>();
        sources.add(new File(ctx().getNoBackupFilesDir(), AUDIO_DIR));
        for (final File ext: ctx().getExternalFilesDirs(null)) {
            if (ext != null) sources.add(new File(ext, AUDIO_DIR));
        }
        final String location = ctx().getSharedPreferences(defaultPrefsName(), Context.MODE_PRIVATE).getString("audio_location", null);
        if (location != null && !location.isEmpty() && !location.equals("Internal")) {
            final File f = new File(location, AUDIO_DIR);
            if (!sources.contains(f)) sources.add(f);
        }
        int files = 0;
        long bytes = 0;
        int failed = 0;
        for (final File src: sources) {
            final File[] levels = src.listFiles();
            if (levels == null) continue;
            for (final File level: levels) {
                if (!level.isDirectory() || !level.getName().matches("\\d+")) continue;
                final File[] audio = level.listFiles();
                if (audio == null) continue;
                final File dest = new File(target, level.getName());
                //noinspection ResultOfMethodCallIgnored
                dest.mkdirs();
                for (final File a: audio) {
                    if (!a.isFile() || !a.getName().matches("\\d+\\.(mp3|ogg)")) continue;
                    final File to = new File(dest, a.getName());
                    final long size = a.length();
                    try {
                        if (to.isFile() && to.length() > 0) {
                            //noinspection ResultOfMethodCallIgnored
                            a.delete();
                            continue;
                        }
                        if (!a.renameTo(to)) {
                            final File tmp = new File(dest, a.getName() + ".downloading.tmp");
                            copyFile(a, tmp);
                            if (!tmp.renameTo(to)) throw new Exception("rename failed");
                            //noinspection ResultOfMethodCallIgnored
                            a.delete();
                        }
                        files++;
                        bytes += size;
                    } catch (final Exception e) {
                        failed++;
                    }
                }
                //noinspection ResultOfMethodCallIgnored
                level.delete(); // only when empty
            }
            //noinspection ResultOfMethodCallIgnored
            src.delete(); // only when empty
        }
        final JSObject ret = new JSObject();
        ret.put("files", files);
        ret.put("bytes", bytes);
        ret.put("failed", failed);
        call.resolve(ret);
    }

    /** "Remove old app data": the Room database, the default and the encrypted preferences, the master key. */
    @PluginMethod
    public void removeOldData(final PluginCall call) {
        try {
            final boolean db = ctx().deleteDatabase(DB_NAME);
            final boolean prefs = ctx().deleteSharedPreferences(defaultPrefsName());
            final boolean enc = ctx().deleteSharedPreferences(ENCRYPTED_PREFS);
            boolean key = false;
            try {
                final KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
                ks.load(null);
                if (ks.containsAlias(MASTER_KEY_ALIAS)) {
                    ks.deleteEntry(MASTER_KEY_ALIAS);
                    key = true;
                }
            } catch (final Exception ignored) {
                // Only the unused key stays behind.
            }
            final JSObject ret = new JSObject();
            ret.put("database", db);
            ret.put("settings", prefs);
            ret.put("encryptedSettings", enc);
            ret.put("masterKey", key);
            call.resolve(ret);
        } catch (final Exception e) {
            call.reject("Could not remove the old app's data: " + e.getMessage(), e);
        }
    }

    private static boolean tableExists(final SQLiteDatabase sql, final String table) {
        return longQuery(sql, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'", 0) > 0;
    }

    private static long longQuery(final SQLiteDatabase sql, final String query, final long def) {
        try (Cursor c = sql.rawQuery(query, null)) {
            return c.moveToFirst() ? c.getLong(0) : def;
        }
    }

    /** `ProgressStore.existing`. */
    private static List<String> existing(final SQLiteDatabase sql, final String table, final String[] wanted) {
        final List<String> have = new ArrayList<>();
        try (Cursor c = sql.rawQuery("PRAGMA table_info(`" + table + "`)", null)) {
            final int idx = c.getColumnIndexOrThrow("name");
            while (c.moveToNext()) have.add(c.getString(idx));
        }
        final List<String> out = new ArrayList<>();
        for (final String w: wanted) {
            if (have.contains(w)) out.add(w);
        }
        return out;
    }

    private static String join(final List<String> cols) {
        final StringBuilder sb = new StringBuilder();
        for (final String c: cols) sb.append(sb.length() == 0 ? "" : ", ").append('`').append(c).append('`');
        return sb.toString();
    }

    /** `ProgressStore.row`. */
    private static JSONObject row(final Cursor c, final List<String> cols) throws Exception {
        final JSONObject o = new JSONObject();
        for (int i = 0; i < cols.size(); i++) {
            switch (c.getType(i)) {
                case Cursor.FIELD_TYPE_NULL: break;
                case Cursor.FIELD_TYPE_INTEGER: o.put(cols.get(i), c.getLong(i)); break;
                case Cursor.FIELD_TYPE_FLOAT: o.put(cols.get(i), c.getDouble(i)); break;
                default: o.put(cols.get(i), c.getString(i)); break;
            }
        }
        return o;
    }

    private static void copyFile(final File from, final File to) throws Exception {
        try (InputStream in = new FileInputStream(from); OutputStream out = new FileOutputStream(to)) {
            final byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    private static void deleteTree(final File f) {
        final File[] children = f.listFiles();
        if (children != null) {
            for (final File c: children) deleteTree(c);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
