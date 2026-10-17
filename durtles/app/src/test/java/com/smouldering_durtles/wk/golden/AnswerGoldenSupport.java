package com.smouldering_durtles.wk.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smouldering_durtles.wk.model.AnswerVerdict;
import com.smouldering_durtles.wk.model.DigraphMatch;
import com.smouldering_durtles.wk.util.PseudoIme;

import java.io.IOException;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;

/**
 * Shared helpers for the answer and kana golden tests (golden-a): verdict serialization, a romanizer
 * that produces input for {@link PseudoIme}, typo generation and a sharding wrapper around
 * {@link GoldenWriter} for JSON Lines files that would otherwise get too big.
 */
final class AnswerGoldenSupport {
    static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String VOWELS = "aiueo";
    private static final String CONSONANTS = "bcdfghjklmnpqrstvwxyz";

    private AnswerGoldenSupport() {
        //
    }

    /**
     * An {@link AnswerVerdict} as a JSON object. {@code digraph} is null or {@code [regularKana, smallKana]}.
     */
    static Map<String, Object> verdict(final AnswerVerdict v) {
        final DigraphMatch d = v.getDigraphMatch();
        return obj("ok", v.isOk(), "retry", v.isRetry(), "nearMatch", v.isNearMatch(),
                "givenAnswer", v.getGivenAnswer(), "matchedAnswer", v.getMatchedAnswer(),
                "digraph", d == null ? null : new String[] {String.valueOf(d.getRegularKana()), String.valueOf(d.getSmallKana())});
    }

    /** The outcome of a call that may throw: {@code {"value": ...}} or {@code {"error": "SimpleClassName"}}. */
    interface Call {
        Object run() throws Exception;
    }

    static Map<String, Object> attempt(final Call call) {
        try {
            return obj("value", call.run());
        } catch (final Exception e) {
            return obj("error", e.getClass().getSimpleName(), "message", e.getMessage());
        }
    }

    /** PseudoIme's private romaji to kana table, read by reflection. Sorted by key. */
    @SuppressWarnings("unchecked")
    static TreeMap<String, String> kanaMap() {
        try {
            final Field f = PseudoIme.class.getDeclaredField("KANA_MAP");
            f.setAccessible(true);
            return new TreeMap<>((Map<String, String>) f.get(null));
        } catch (final ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Map<String, String> reverse = null;

    /**
     * kana -> preferred romaji, built from PseudoIme's table: the shortest key, preferring keys that
     * do not start with c, l, q or x, then alphabetical. Upper-case keys give katakana.
     */
    private static synchronized Map<String, String> reverseKanaMap() {
        if (reverse == null) {
            final Map<String, String> r = new HashMap<>();
            for (final Map.Entry<String, String> e: kanaMap().entrySet()) {
                final String key = e.getKey();
                if (key.contains(" ") || key.equals("-")) {
                    continue;
                }
                final String old = r.get(e.getValue());
                if (old == null || rank(key).compareTo(rank(old)) < 0) {
                    r.put(e.getValue(), key);
                }
            }
            reverse = r;
        }
        return reverse;
    }

    private static String rank(final String key) {
        final char c = Character.toLowerCase(key.charAt(0));
        final boolean odd = "clqx".indexOf(c) >= 0;
        return key.length() + (odd ? "1" : "0") + key;
    }

    /**
     * Romanize kana so that typing the result into PseudoIme is expected to give the kana back
     * (not guaranteed; that is what the fixtures record). Hiragana gives lower-case romaji, katakana
     * upper-case. っ doubles the next consonant, ん is "n" before a consonant and "nn" otherwise, ー is "-".
     * Characters PseudoIme cannot produce are copied as they are.
     */
    static String romanize(final String kana) {
        final Map<String, String> rev = reverseKanaMap();
        final StringBuilder sb = new StringBuilder();
        int i = 0;
        boolean pendingTsu = false;
        boolean pendingTsuUpper = false;
        while (i < kana.length()) {
            final char c = kana.charAt(i);
            if (c == 'っ' || c == 'ッ') {
                if (pendingTsu) {
                    sb.append(pendingTsuUpper ? "XTU" : "xtu");
                }
                pendingTsu = true;
                pendingTsuUpper = c == 'ッ';
                i++;
                continue;
            }
            String romaji = null;
            int len = 0;
            for (int l = Math.min(2, kana.length() - i); l >= 1; l--) {
                final String r = rev.get(kana.substring(i, i + l));
                if (r != null) {
                    romaji = r;
                    len = l;
                    break;
                }
            }
            if (c == 'ん' || c == 'ン') {
                romaji = c == 'ん' ? "n" : "N";
                len = 1;
                final String next = i + 1 < kana.length() ? romanize(kana.substring(i + 1, i + 2)) : "";
                final char n = next.isEmpty() ? ' ' : Character.toLowerCase(next.charAt(0));
                if (!next.isEmpty() && (VOWELS.indexOf(n) >= 0 || n == 'y' || n == 'n')) {
                    romaji = c == 'ん' ? "nn" : "NN";
                }
            }
            if (c == 'ー') {
                romaji = "-";
                len = 1;
            }
            if (romaji == null) {
                romaji = String.valueOf(c);
                len = 1;
            }
            if (pendingTsu) {
                final char first = Character.toLowerCase(romaji.charAt(0));
                if (CONSONANTS.indexOf(first) >= 0 && first != 'n' && first != 'y') {
                    sb.append(romaji.charAt(0));
                }
                else {
                    sb.append(pendingTsuUpper ? "XTU" : "xtu");
                }
                pendingTsu = false;
            }
            sb.append(romaji);
            i += len;
        }
        if (pendingTsu) {
            sb.append(pendingTsuUpper ? "XTU" : "xtu");
        }
        return sb.toString();
    }

    private static final String TYPO_LETTERS = "abcdefghijklmnopqrstuvwxyz";

    /**
     * Apply {@code count} random edits (substitute, insert, delete, transpose) to a string. Letters are
     * drawn from a-z, or from the string's own characters when it has no ASCII letters (kana).
     */
    static String typo(final String s, final int count, final Random random) {
        String result = s;
        for (int k = 0; k < count; k++) {
            final String pool = result.matches(".*[a-zA-Z].*") || result.isEmpty() ? TYPO_LETTERS : result;
            final char letter = pool.charAt(random.nextInt(pool.length()));
            final int op = result.length() < 2 ? random.nextInt(2) : random.nextInt(4);
            final int pos = result.isEmpty() ? 0 : random.nextInt(result.length());
            switch (op) {
                case 0:
                    result = result.substring(0, pos) + letter + result.substring(pos);
                    break;
                case 1:
                    if (result.isEmpty()) {
                        result = String.valueOf(letter);
                    }
                    else {
                        result = result.substring(0, pos) + letter + result.substring(pos + 1);
                    }
                    break;
                case 2:
                    result = result.substring(0, pos) + result.substring(pos + 1);
                    break;
                default:
                    final int p = Math.min(pos, result.length() - 2);
                    result = result.substring(0, p) + result.charAt(p + 1) + result.charAt(p) + result.substring(p + 2);
                    break;
            }
        }
        return result;
    }

    /** Parse a JSON text column from the content DB; null or empty gives an empty array node. */
    static JsonNode parseColumn(final JsonNode row, final String column) throws IOException {
        final JsonNode v = row.get(column);
        if (v == null || v.isNull() || v.asText().isEmpty()) {
            return MAPPER.createArrayNode();
        }
        return MAPPER.readTree(v.asText());
    }

    /**
     * JSON Lines output split into numbered shards of at most {@code maxCases} cases:
     * {@code <prefix>-1.jsonl}, {@code <prefix>-2.jsonl}, ... A single shard is still numbered, so the
     * file names do not depend on the case count.
     */
    static final class ShardedWriter implements AutoCloseable {
        private final String prefix;
        private final String area;
        private final String javaSource;
        private final int maxCases;
        private final List<String> files = new ArrayList<>();
        private final List<Integer> counts = new ArrayList<>();
        private GoldenWriter current = null;
        private int total = 0;

        ShardedWriter(final String prefix, final String area, final String javaSource, final int maxCases) {
            this.prefix = prefix;
            this.area = area;
            this.javaSource = javaSource;
            this.maxCases = maxCases;
        }

        void add(final String name, final Object input, final Object output) throws IOException {
            if (current == null || current.size() >= maxCases) {
                flush();
                final String file = prefix + "-" + (files.size() + 1) + ".jsonl";
                files.add(file);
                current = GoldenWriter.openJsonl(file, area, javaSource);
            }
            current.add(name, input, output);
            total++;
        }

        private void flush() throws IOException {
            if (current != null) {
                counts.add(current.size());
                current.close();
                current = null;
            }
        }

        int total() {
            return total;
        }

        List<String> files() {
            return Collections.unmodifiableList(files);
        }

        @Override
        public void close() throws IOException {
            flush();
        }
    }
}
