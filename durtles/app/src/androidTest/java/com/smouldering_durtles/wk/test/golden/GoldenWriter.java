package com.smouldering_durtles.wk.test.golden;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Collects golden cases ({@code name}, {@code input}, {@code output}) and writes them as a fixture
 * under {@code $GOLDEN_DIR} when the test closes it. Without {@code GOLDEN_DIR} it only collects,
 * so the test still runs (and exercises the Java code) but writes nothing.
 *
 * <p>Two formats, chosen by the method that opens the writer:
 * <ul>
 *   <li>{@link #open}: one JSON document
 *   {@code {"area", "javaSource", "cases": [ ... ]}} with exactly one case per line.</li>
 *   <li>{@link #openJsonl}: JSON Lines. Line 1 is the header {@code {"area","javaSource"}},
 *   every further line is one case {@code {"name","input","output"}}.</li>
 * </ul>
 *
 * <p>Values may be null, String, Number, Boolean, Map (written in iteration order, so use
 * {@link LinkedHashMap} or {@link #obj}), List/Collection, or Java arrays. Output is UTF-8,
 * LF line endings, no escaping of non-ASCII, trailing newline, so regenerating from the same Java
 * code gives identical bytes. Case names must be unique within a file.
 */
public final class GoldenWriter implements AutoCloseable {
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, false)
            .configure(SerializationFeature.FAIL_ON_EMPTY_BEANS, true)
            .configure(JsonGenerator.Feature.ESCAPE_NON_ASCII, false);

    private static File baseDirOverride = null;

    private final String relativePath;
    private final String area;
    private final String javaSource;
    private final boolean jsonl;
    private final List<String> lines = new ArrayList<>();
    private final Set<String> names = new HashSet<>();
    private boolean closed = false;

    private GoldenWriter(final String relativePath, final String area, final String javaSource, final boolean jsonl) {
        this.relativePath = relativePath;
        this.area = area;
        this.javaSource = javaSource;
        this.jsonl = jsonl;
    }

    /** Single JSON document, e.g. {@code open("srs/new-stage.json", "srs.newStage", "model/SrsSystem.Stage.getNewStage")}. */
    public static GoldenWriter open(final String relativePath, final String area, final String javaSource) {
        return new GoldenWriter(relativePath, area, javaSource, false);
    }

    /** JSON Lines variant for large files; relativePath should end in {@code .jsonl}. */
    public static GoldenWriter openJsonl(final String relativePath, final String area, final String javaSource) {
        return new GoldenWriter(relativePath, area, javaSource, true);
    }

    /**
     * Overrides the output directory (used by instrumented tests, which have no env var). Pass null to
     * go back to {@code $GOLDEN_DIR}.
     */
    public static void setBaseDir(final File dir) {
        baseDirOverride = dir;
    }

    /** The directory fixtures go to, or null when generation is off. */
    public static File baseDir() {
        if (baseDirOverride != null) {
            return baseDirOverride;
        }
        final String env = System.getenv("GOLDEN_DIR");
        if (env == null || env.isEmpty()) {
            return null;
        }
        return new File(env);
    }

    public static boolean enabled() {
        return baseDir() != null;
    }

    /** Ordered map from alternating keys and values: {@code obj("a", 1, "b", "x")}. */
    public static Map<String, Object> obj(final Object... keysAndValues) {
        if (keysAndValues.length % 2 != 0) {
            throw new IllegalArgumentException("obj() needs an even number of arguments");
        }
        final Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < keysAndValues.length; i += 2) {
            final String key = (String) keysAndValues[i];
            if (m.containsKey(key)) {
                throw new IllegalArgumentException("duplicate key " + key);
            }
            m.put(key, keysAndValues[i + 1]);
        }
        return m;
    }

    public GoldenWriter add(final String name, final Object input, final Object output) {
        if (closed) {
            throw new IllegalStateException("writer already closed");
        }
        if (name == null || !names.add(name)) {
            throw new IllegalArgumentException("case name missing or not unique: " + name);
        }
        lines.add(json(obj("name", name, "input", input, "output", output)));
        return this;
    }

    public int size() {
        return lines.size();
    }

    @Override
    public void close() throws IOException {
        if (closed) {
            return;
        }
        closed = true;
        final File dir = baseDir();
        if (dir == null) {
            return;
        }
        final StringBuilder sb = new StringBuilder();
        if (jsonl) {
            sb.append(json(obj("area", area, "javaSource", javaSource))).append('\n');
            for (final String line: lines) {
                sb.append(line).append('\n');
            }
        }
        else {
            sb.append("{\n");
            sb.append("  \"area\": ").append(json(area)).append(",\n");
            sb.append("  \"javaSource\": ").append(json(javaSource)).append(",\n");
            if (lines.isEmpty()) {
                sb.append("  \"cases\": []\n");
            }
            else {
                sb.append("  \"cases\": [\n");
                for (int i = 0; i < lines.size(); i++) {
                    sb.append("    ").append(lines.get(i)).append(i + 1 < lines.size() ? ",\n" : "\n");
                }
                sb.append("  ]\n");
            }
            sb.append("}\n");
        }
        final File file = new File(dir, relativePath);
        final File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new IOException("cannot create " + parent);
        }
        try (final OutputStream os = Files.newOutputStream(file.toPath())) {
            os.write(sb.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String json(final Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (final JsonProcessingException e) {
            throw new IllegalArgumentException("cannot serialize golden value: " + value, e);
        }
    }
}
