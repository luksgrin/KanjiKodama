package com.smouldering_durtles.wk.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Read-only access to the bundled (git-ignored) content databases for golden tests, through the
 * {@code sqlite3} command line tool, since the unit-test classpath has no SQLite driver. Tests that
 * need the content call {@link #available()} and skip (JUnit assumption) when it is false.
 *
 * <p>The database is {@code $GOLDEN_CONTENT_DB} if set, else {@code src/main/assets/wk-content.db}
 * relative to the module directory (Gradle's working directory for unit tests).</p>
 */
public final class GoldenContent {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private GoldenContent() {
        //
    }

    public static File assetsDir() {
        return new File("src/main/assets");
    }

    public static File contentDb() {
        final String env = System.getenv("GOLDEN_CONTENT_DB");
        if (env != null && !env.isEmpty()) {
            return new File(env);
        }
        return new File(assetsDir(), "wk-content.db");
    }

    public static boolean available() {
        if (!contentDb().isFile()) {
            return false;
        }
        try {
            query("SELECT 1 AS x");
            return true;
        } catch (final Exception e) {
            return false;
        }
    }

    /** Runs a query and returns the rows as a JSON array of objects (sqlite3 -json). */
    public static JsonNode query(final String sql) throws IOException, InterruptedException {
        final Process p = new ProcessBuilder("sqlite3", "-readonly", "-json", contentDb().getPath(), sql)
                .redirectErrorStream(false).start();
        final byte[] out = readAll(p.getInputStream());
        final byte[] err = readAll(p.getErrorStream());
        if (!p.waitFor(120, TimeUnit.SECONDS) || p.exitValue() != 0) {
            throw new IOException("sqlite3 failed: " + new String(err, StandardCharsets.UTF_8));
        }
        final String text = new String(out, StandardCharsets.UTF_8).trim();
        return MAPPER.readTree(text.isEmpty() ? "[]" : text);
    }

    private static byte[] readAll(final InputStream in) throws IOException {
        final ByteArrayOutputStream bos = new ByteArrayOutputStream();
        final byte[] buf = new byte[1 << 16];
        int n;
        while ((n = in.read(buf)) > 0) {
            bos.write(buf, 0, n);
        }
        return bos.toByteArray();
    }
}
