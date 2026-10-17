/*
 * KanjiKodama server mode: connect to a WaniKani-compatible server (such as OpenKani) that decides SRS.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.database.Cursor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smouldering_durtles.wk.BuildConfig;
import com.smouldering_durtles.wk.Constants;
import com.smouldering_durtles.wk.GlobalSettings;
import com.smouldering_durtles.wk.Identification;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.api.model.ApiUser;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.Converters;
import com.smouldering_durtles.wk.services.ApiTaskService;
import com.smouldering_durtles.wk.tasks.ApiTask;
import com.smouldering_durtles.wk.tasks.WaniKaniImporter;
import com.smouldering_durtles.wk.util.Logger;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Collections;
import java.util.Locale;

import javax.annotation.Nullable;

import static com.smouldering_durtles.wk.Constants.MINUTE;
import static com.smouldering_durtles.wk.Constants.SECOND;

/**
 * Switching between local mode and server mode, and the calls needed to set up a connection.
 *
 * <p>Each mode has exactly one source of truth, so a switch replaces what is on the device: going to
 * server mode clears local progress and downloads everything from the server; going back to local mode
 * starts over from the bundled content, optionally with the server's progress imported.</p>
 */
public final class ServerMode {
    private static final Logger LOGGER = Logger.get(ServerMode.class);

    private ServerMode() {
        //
    }

    /**
     * Clean up a URL typed by the learner: add https:// if no scheme was given, drop a trailing slash and /v2.
     *
     * @param raw the typed URL
     * @return the base URL
     * @throws IllegalArgumentException with a readable message if it is not a usable URL
     */
    public static String normalize(final String raw) {
        String s = raw.trim();
        if (!s.contains("://")) {
            s = "https://" + s;
        }
        while (s.endsWith("/")) {
            s = s.substring(0, s.length() - 1);
        }
        if (s.toLowerCase(Locale.ROOT).endsWith("/v2")) {
            s = s.substring(0, s.length() - 3);
        }
        final URI uri;
        try {
            uri = new URI(s);
        } catch (final Exception e) {
            throw new IllegalArgumentException("This is not a valid server address.");
        }
        final @Nullable String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme) || uri.getHost() == null) {
            throw new IllegalArgumentException("The server address must start with https:// or http://.");
        }
        return s;
    }

    /**
     * A short name for a server, for messages: "WaniKani" or the host name.
     *
     * @param baseUrl the base URL
     * @return the name
     */
    public static String label(final String baseUrl) {
        if (isWaniKani(baseUrl)) {
            return "WaniKani";
        }
        try {
            final @Nullable String host = new URI(baseUrl).getHost();
            return host != null ? host : baseUrl;
        } catch (final Exception e) {
            return baseUrl;
        }
    }

    /**
     * True when a base URL is WaniKani's own API.
     *
     * @param baseUrl the base URL
     * @return the value
     */
    public static boolean isWaniKani(final String baseUrl) {
        return Constants.WANIKANI_API_BASE_URL.equalsIgnoreCase(baseUrl);
    }

    /**
     * True when server mode talks to WaniKani itself.
     *
     * @return the value
     */
    public static boolean isWaniKani() {
        return isWaniKani(GlobalSettings.Api.getBaseUrl());
    }

    /**
     * Check a token against a server and fetch the account, without switching anything.
     *
     * @param baseUrl the normalized base URL
     * @param token the API token for that server
     * @return the user
     * @throws Exception with a readable message when the token or the network fails
     */
    public static ApiUser check(final String baseUrl, final String token) throws Exception {
        ApiTask.setBaseUrlOverride(baseUrl);
        try {
            return WaniKaniImporter.checkToken(token);
        } finally {
            ApiTask.setBaseUrlOverride(null);
        }
    }

    /**
     * Ask an OpenKani-style server to copy the learner's WaniKani data (POST /v2/migrate) into its own
     * database for that learner, and return the server's token for it. Data copied before is not copied
     * again; the server returns the existing token.
     *
     * @param baseUrl the normalized base URL
     * @param wkApiKey a WaniKani personal access token
     * @return the server's token for the copied data
     * @throws Exception with a readable message when it fails
     */
    public static String migrate(final String baseUrl, final String wkApiKey) throws Exception {
        final ObjectMapper mapper = Converters.getObjectMapper();
        final String server = label(baseUrl);
        final HttpURLConnection connection;
        final int code;
        final @Nullable JsonNode body;
        try {
            connection = (HttpURLConnection) new URL(baseUrl + "/v2/migrate").openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("User-Agent", Identification.APP_NAME_UA + "/" + BuildConfig.VERSION_NAME);
            connection.setDoInput(true);
            connection.setDoOutput(true);
            connection.setConnectTimeout((int) (10 * SECOND));
            // Copying everything from WaniKani can take minutes on a small server.
            connection.setReadTimeout((int) (10 * MINUTE));
            try (final OutputStream os = connection.getOutputStream()) {
                mapper.writeValue(os, Collections.singletonMap("wanikani_api_key", wkApiKey));
            }
            code = connection.getResponseCode();
            try (final @Nullable InputStream is = code < 400 ? connection.getInputStream() : connection.getErrorStream()) {
                body = is == null ? null : mapper.readTree(is);
            }
        } catch (final Exception e) {
            LOGGER.error(e, "Migration request failed");
            throw new IllegalStateException("Could not reach " + server + ". Check the address and the connection.");
        }
        final @Nullable JsonNode token = body == null ? null : body.get("token");
        if ((code == 200 || code == 409) && token != null && token.isTextual() && !token.asText().isEmpty()) {
            return token.asText();
        }
        if (code == 401) {
            throw new IllegalStateException("WaniKani rejected this API token.");
        }
        if (code == 404) {
            throw new IllegalStateException(server + " cannot copy data from WaniKani."
                    + " Paste a token for " + server + " instead.");
        }
        final @Nullable JsonNode error = body == null ? null : body.get("error");
        throw new IllegalStateException(server + " could not copy the WaniKani data (" + code + ")"
                + (error != null && error.isTextual() ? ": " + error.asText() : "."));
    }

    /**
     * The number of answers, lesson starts and notes still waiting to be sent to the server.
     *
     * @return the count
     */
    public static int pendingUploads() {
        final AppDatabase db = WkApplication.getDatabase();
        try (final Cursor c = db.getOpenHelper().getReadableDatabase().query("SELECT COUNT(*) FROM task_definition"
                + " WHERE taskClass LIKE '%.ReportSessionItemTask' OR taskClass LIKE '%.SubmitStudyMaterialTask'")) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    /**
     * Switch to server mode. Local progress is cleared and everything is downloaded from the server in the
     * background, the same as a first start of upstream's app.
     *
     * @param baseUrl the normalized base URL
     * @param token the API token for that server
     * @param user the user returned by {@link #check(String, String)}
     */
    public static void switchToServer(final String baseUrl, final String token, final ApiUser user) {
        final AppDatabase db = WkApplication.getDatabase();
        GlobalSettings.Api.setBaseUrl(baseUrl);
        GlobalSettings.Api.setApiKey(token);
        GlobalSettings.Api.setServerMode(true);
        Curriculum.onServerMode();
        // Record the account first, so the user sync does not see a new account and reset a second time.
        if (user.getId() != null) {
            db.propertiesDao().setUserId(user.getId());
        }
        db.propertiesDao().setUserLevel(Math.max(1, user.getLevel()));
        db.resetDatabase();
        ApiTaskService.schedule();
    }

    /**
     * Download the server account's progress before leaving server mode, without changing anything.
     *
     * @return the downloaded progress
     * @throws Exception with a readable message when the download fails
     */
    public static WaniKaniImporter.Download downloadForLocal() throws Exception {
        final @Nullable String token = GlobalSettings.Api.getApiKey();
        if (token == null || token.isEmpty()) {
            throw new IllegalStateException("There is no API token for " + label(GlobalSettings.Api.getBaseUrl()) + ".");
        }
        return WaniKaniImporter.download(WaniKaniImporter.checkToken(token));
    }

    /**
     * Switch to local mode: start over from the bundled content, then apply the server's progress if given.
     *
     * @param download the result of {@link #downloadForLocal()}, or null to start from level 1
     * @return a short summary
     */
    public static String switchToLocal(final @Nullable WaniKaniImporter.Download download) {
        final AppDatabase db = WkApplication.getDatabase();
        GlobalSettings.Api.setServerMode(false);
        db.resetDatabase();
        ApiTaskService.schedule();
        if (download == null) {
            return "Local mode, starting at level 1.";
        }
        return "Local mode. " + WaniKaniImporter.apply(download);
    }
}
