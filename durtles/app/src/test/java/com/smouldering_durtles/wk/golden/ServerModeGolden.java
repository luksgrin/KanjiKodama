package com.smouldering_durtles.wk.golden;

import com.smouldering_durtles.wk.local.ServerMode;

import org.junit.Test;

import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.attempt;
import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertEquals;

/**
 * Golden cases for {@link ServerMode#normalize} (the typed server URL) and {@link ServerMode#label}
 * (its short name), applied both to the raw text and to the normalized URL. {@code isWaniKani} is
 * included because {@code label} depends on it.
 */
public final class ServerModeGolden {
    private static final String[] URLS = {
            "https://api.wanikani.com", "https://api.wanikani.com/", "https://api.wanikani.com/v2", "https://api.wanikani.com/v2/",
            "api.wanikani.com", "api.wanikani.com/v2", "HTTPS://API.WANIKANI.COM", "https://API.wanikani.com/V2",
            "https://openkani.example.org", "openkani.example.org", "  openkani.example.org  ", "http://openkani.example.org",
            "http://localhost:3000", "localhost:3000", "localhost", "http://127.0.0.1:8080/", "192.168.1.20:3000/v2",
            "http://[::1]:3000", "https://example.org/wk", "https://example.org/wk/", "https://example.org/wk/v2",
            "https://example.org/wk/v2//", "https://example.org///", "https://example.org/v2/v2", "https://example.org/V2",
            "https://example.org/api/v20", "https://example.org?x=1", "https://example.org/#frag", "https://user:pw@example.org",
            "ftp://example.org", "file:///etc/hosts", "mailto:me@example.org", "ws://example.org", "https://", "https:///v2",
            "", "   ", "/", "://example.org", "https://exa mple.org", "https://example.org/a b", "not a url", "example",
            "https://bücher.example", "https://example.org:99999", "https://-bad-.example", "http://under_score.example.org",
            "https://example.org.", "HTTP://Example.Org/V2/", "https://api.wanikani.com:443",
    };

    @Test
    public void generate() throws Exception {
        assertEquals("https://example.org", ServerMode.normalize("example.org/v2/"));
        try (final GoldenWriter w = GoldenWriter.open("server/normalize.json", "server.normalize",
                "local/ServerMode.normalize, label, isWaniKani")) {
            for (int i = 0; i < URLS.length; i++) {
                final String raw = URLS[i];
                final Object normalized = attempt(() -> ServerMode.normalize(raw));
                @SuppressWarnings("unchecked")
                final Object value = ((java.util.Map<String, Object>) normalized).get("value");
                w.add("url-" + (i + 1), obj("raw", raw), obj(
                        "normalize", normalized,
                        "labelOfRaw", ServerMode.label(raw),
                        "isWaniKaniRaw", ServerMode.isWaniKani(raw),
                        "labelOfNormalized", value == null ? null : ServerMode.label((String) value),
                        "isWaniKaniNormalized", value == null ? null : ServerMode.isWaniKani((String) value)));
            }
        }
    }
}
