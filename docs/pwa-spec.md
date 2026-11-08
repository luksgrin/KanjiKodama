# Kanji Learning App — Product Specification

> **History (2026-10-26).** An early product spec for a PWA, kept for reference. The app that was
> built is described in the [README](../README.md) and [plan.md](plan.md).

**Document type:** Product and Technical Specification
**Version:** 1.0
**Platform:** Progressive Web App (PWA)
**Primary target:** iOS Safari and Android Chrome
**Core principles:** Offline-first, local storage, no backend, no mandatory accounts, no paid app-store distribution.

---

## 1. Project Overview

Build a mobile-first kanji learning application that provides an app-like experience without requiring installation through the Apple App Store or Google Play Store.

Users access the application through a web browser and can add it to their device's home screen. Once loaded, the application must be usable offline, with all learning data and progress stored locally on the user's device.

The application must have its own name, logo, application icon, and standalone display mode.

### 1.1 Primary goals

* Provide an enjoyable and effective kanji learning experience.
* Work offline after initial loading and caching.
* Require no user account or registration.
* Store learning progress entirely on the device.
* Avoid maintaining a backend server or remote database.
* Avoid recurring app-store developer fees.
* Support installation through the browser's Add to Home Screen feature.
* Be responsive and optimized for smartphone screens.

### 1.2 Non-goals

The initial version will not include:

* User accounts or authentication.
* Cloud synchronization between devices.
* Social features, leaderboards, or shared profiles.
* Server-side APIs or a remote database.
* Mandatory subscriptions or payments.
* Native App Store or Google Play distribution.
* Remote AI services or features that require an internet connection.

---

## 2. Platform and Installation

### 2.1 Progressive Web App

The application must be implemented as a Progressive Web App.

Required capabilities:

* A valid web app manifest.
* A custom application name and short name.
* Custom application icons.
* `display: standalone` or an equivalent supported standalone presentation.
* A registered service worker.
* HTTPS hosting.
* Offline caching of the application shell and required learning data.
* A responsive mobile interface.

### 2.2 iOS installation

Users must be able to install the app using Safari:

1. Open the application URL.
2. Open the Share menu.
3. Select Add to Home Screen.
4. Confirm the application name and icon.
5. Launch the application from the home screen.

Provide an optional onboarding guide explaining this process.

The guide should be dismissible and must not block normal application use.

### 2.3 Android installation

Support adding the application to the home screen through Chrome. Where available, support the browser's install prompt.

Installation must not be required to use the application.

---

## 3. Learning Features

### 3.1 Kanji library

Provide a searchable library of kanji.

Each kanji record should support the following fields:

* `character`: The kanji character.
* `meanings`: One or more meanings in the configured interface language.
* `onyomi`: On'yomi readings.
* `kunyomi`: Kun'yomi readings.
* `jlptLevel`: Optional JLPT classification.
* `grade`: Optional Japanese school grade classification.
* `strokes`: Stroke count.
* `radicals`: Radical information, when available.
* `examples`: Example vocabulary words.
* `examples[].word`: Japanese word.
* `examples[].reading`: Reading in kana.
* `examples[].meaning`: Translation or explanation.
* `mnemonic`: Optional memory aid.
* `strokeOrder`: Optional stroke-order data or reference.
* `tags`: Optional categorization.

Fields that are unavailable for a particular character may be omitted or left empty.

### 3.2 Browse and search

Users must be able to:

* Browse the full kanji library.
* Search by kanji character.
* Search by meaning.
* Search by reading.
* Filter by JLPT level when available.
* Filter by school grade when available.
* View kanji details.
* Navigate between kanji without repeatedly returning to the library.
* Mark kanji as favorites.

Search must work offline.

### 3.3 Kanji detail screen

Display the selected kanji prominently, together with its available information:

* Character.
* Meanings.
* On'yomi and kun'yomi.
* Example words and readings.
* Stroke count.
* JLPT level and school grade, if available.
* Mnemonic, if available.
* Learning status and review information.

Use a clear visual hierarchy that makes the character the primary focus.

### 3.4 Study mode

Provide a study mode for reviewing kanji.

A study session should:

1. Select a set of kanji.
2. Present a prompt, such as a kanji character or meaning.
3. Allow the user to reveal the answer.
4. Show relevant readings and meanings.
5. Allow the user to mark the answer as known or not known.
6. Update local learning progress.
7. Continue to the next card.

The initial implementation may use simple self-assessment rather than automated handwriting recognition.

### 3.5 Spaced repetition

Implement a local spaced-repetition system to schedule reviews.

Each kanji's learning state should include:

* New or unseen.
* Learning.
* Review.
* Last reviewed timestamp.
* Next review timestamp.
* Consecutive correct answers or equivalent repetition state.
* Ease or difficulty value, if required by the chosen algorithm.

Use a deterministic scheduling algorithm, such as SM-2, or a simpler configurable algorithm for the initial release.

The algorithm must run entirely on the device.

The user must be able to review due kanji and see how many reviews are due.

### 3.6 Progress dashboard

Display useful learning statistics, including:

* Total kanji in the library.
* Kanji studied.
* Kanji learned.
* Reviews due today.
* Current study streak, if implemented.
* Recent study activity.
* Overall completion by JLPT level, where applicable.

Statistics must be derived from locally stored progress.

Do not require internet access to display the dashboard.

### 3.7 Settings

Provide settings for:

* Interface language, if multiple languages are implemented.
* Preferred study direction or prompt type.
* Daily study target.
* Review scheduling preferences.
* Resetting learning progress.
* Exporting progress.
* Importing a previous backup.
* Viewing the application's version.
* Viewing installation instructions.

Destructive actions must require confirmation.

---

## 4. Offline-First Architecture

### 4.1 General requirement

The application must not depend on a backend server for its core functionality.

After the application has been loaded successfully online and the required assets have been cached, the following must work without an internet connection:

* Launching the application.
* Navigating between screens.
* Browsing kanji.
* Searching and filtering.
* Viewing kanji details.
* Studying and reviewing kanji.
* Updating progress and favorites.
* Viewing statistics.
* Changing settings.
* Exporting and importing progress.

The application must not make network requests during normal offline learning operations.

### 4.2 Local kanji dataset

Bundle the kanji dataset with the application as static data.

Possible formats include JSON files or a generated local database.

Requirements:

* The dataset must be available offline.
* The application must not require an API to retrieve kanji information.
* Dataset loading must be optimized for mobile devices.
* Dataset updates must not silently erase user progress.
* All data sources and licenses must be documented.

If the dataset is large, it may be divided into static files that are cached and loaded locally.

### 4.3 Local storage

Use IndexedDB as the primary persistent storage mechanism.

Store:

* User learning progress.
* Review scheduling state.
* Favorites.
* User preferences.
* Study history, if implemented.
* Dataset metadata and local indexing information, if necessary.

Use localStorage only for small, non-critical preferences where appropriate.

Do not store essential progress exclusively in temporary in-memory state.

### 4.4 Data model

Use a versioned local data schema.

Suggested logical stores:

**Kanji**

* Static character data.
* Indexed fields for search and filtering.

**Progress**

* Kanji identifier.
* Learning state.
* Last reviewed timestamp.
* Next review timestamp.
* Review statistics.

**Favorites**

* Kanji identifiers.
* Optional creation timestamps.

**Settings**

* User preferences.
* Daily study target.
* Scheduling configuration.

**StudySessions**

* Optional session history and aggregate statistics.

The kanji identifier must be stable across application updates.

Static reference data and user progress must be stored or managed separately so that updating the kanji dataset cannot overwrite learning history.

### 4.5 Storage durability

Browser storage is local to the browser profile and origin. It is not equivalent to a native application's private database with guaranteed survival.

Requirements:

* Handle storage errors gracefully.
* Avoid unnecessary deletion or recreation of IndexedDB databases.
* Request persistent storage through the browser API where supported.
* Explain that clearing browser data can delete progress.
* Provide manual backup and restore.
* Validate imported files before modifying stored data.

Do not claim that user progress is guaranteed to survive device loss, browser data clearing, or operating-system cleanup.

---

## 5. Backup and Restore

Because the application has no server or account system, backup and restore are essential.

### 5.1 Export

Allow the user to export their learning data to a downloadable JSON file.

Include:

* Schema version.
* Export timestamp.
* Learning progress.
* Review scheduling state.
* Favorites.
* User preferences.
* Study history, if implemented.

Do not include the entire static kanji dataset unless explicitly needed.

### 5.2 Import

Allow the user to select a previously exported JSON file.

The application must:

1. Validate the file format.
2. Validate the schema version.
3. Check the structure and types of imported records.
4. Reject malformed or unsupported data.
5. Show a summary of the import.
6. Ask the user whether to merge or replace their current progress.
7. Apply changes safely.
8. Report success or failure.

The import process must not leave the database partially updated if an error occurs.

### 5.3 Backup limitations

The application does not automatically synchronize data between devices.

Users must manually transfer their backup files if they want to move progress to another device.

---

## 6. Service Worker and Caching

Implement a service worker to make the application available offline.

### 6.1 Cache requirements

Cache:

* HTML application shell.
* JavaScript bundles.
* CSS stylesheets.
* Application icons.
* Web app manifest.
* Fonts and other required local assets.
* Kanji dataset.
* Any essential static study resources.

The application must not depend on third-party scripts, remote fonts, or external images for its basic operation.

### 6.2 Offline fallback

If the user opens the app while offline:

* Load the cached application shell.
* Open the locally stored dataset.
* Restore progress from IndexedDB.
* Display a useful error if required initial resources were never cached.

### 6.3 Updates

When a new version is deployed:

* Detect and install the updated application assets.
* Keep existing user progress intact.
* Handle cache versioning and cleanup safely.
* Avoid mixing incompatible application assets.
* Notify users when a significant update is ready, where appropriate.

The application must remain usable if an update cannot be downloaded.

---

## 7. User Interface and Accessibility

### 7.1 Design principles

The interface should feel like a focused mobile learning application rather than a conventional website.

Requirements:

* Mobile-first responsive design.
* Standalone app-like presentation.
* Clear navigation.
* Readable Japanese typography.
* Prominent kanji characters.
* Touch-friendly controls.
* Minimal unnecessary animation.
* Light and dark themes, if practical.
* Consistent spacing and visual hierarchy.

### 7.2 Suggested navigation

The primary navigation may contain:

1. **Home** — Daily overview and progress.
2. **Study** — Due reviews and study sessions.
3. **Browse** — Searchable kanji library.
4. **Favorites** — Saved kanji.
5. **Settings** — Preferences and backup.

Navigation should remain accessible on smartphone screens.

### 7.3 Japanese text

Ensure the interface renders kanji, hiragana, katakana, and Latin characters correctly.

Use appropriate system fonts or bundled fonts with compatible licensing.

The interface must remain functional without downloading fonts at runtime.

### 7.4 Accessibility

* Provide sufficient text and control contrast.
* Support keyboard navigation where relevant.
* Use semantic HTML.
* Give icon-only controls accessible labels.
* Avoid conveying learning status through color alone.
* Respect reduced-motion preferences.
* Keep interactive elements usable with touch and assistive technologies.

---

## 8. Recommended Technology Stack

Prefer a simple stack that is easy to maintain and deploy as static files.

### Frontend

* TypeScript.
* React with Vite, or an equivalent lightweight framework.
* HTML and CSS.
* Responsive component architecture.

A framework is optional; plain TypeScript is also acceptable if it keeps the application simpler.

### PWA

* Web app manifest.
* Service worker.
* Workbox or an equivalent caching solution, if useful.

### Local database

* IndexedDB.
* A small IndexedDB wrapper such as Dexie.js, if useful.

### Testing

* Unit tests for review scheduling and data transformations.
* Browser tests for core workflows.
* Offline tests using browser developer tools.
* Manual testing on actual iPhones and Android devices.

Avoid adding dependencies that require a server or remote service at runtime.

---

## 9. Hosting and Deployment

### 9.1 Hosting model

Deploy the compiled application as static files to an HTTPS-enabled static hosting provider.

Possible options include GitHub Pages, Cloudflare Pages, or another static host with a suitable free tier.

No backend application server is required.

A static host still serves the initial application files; it does not need to execute application logic or store personal learning progress.

### 9.2 Domain

A custom domain is optional.

The application must also be deployable using a provider's standard domain.

If hosted under a subpath, ensure that manifest paths, icons, service-worker scope, and asset URLs work correctly.

### 9.3 Deployment requirements

* Build reproducibly from source.
* Deploy versioned static assets.
* Configure correct content types.
* Serve over HTTPS.
* Ensure the service worker is registered at the intended scope.
* Verify that the application works after deployment, not only in development mode.
* Keep secrets out of client-side files.

---

## 10. Privacy and Security

The application should operate without collecting personal information.

Requirements:

* No mandatory accounts.
* No analytics by default.
* No advertising trackers.
* No remote database.
* No transmission of study history.
* No sensitive information in URLs.
* Validate imported backup files.
* Avoid executing imported content as code.
* Do not require unnecessary browser permissions.

Explain clearly that local storage is not encrypted by default and that users should protect exported backups themselves.

---

## 11. Performance

The application must remain responsive on ordinary smartphones.

Requirements:

* Fast startup after initial caching.
* Efficient kanji search.
* Minimal unnecessary database reads and writes.
* Smooth navigation between learning screens.
* No blocking network dependency during study sessions.
* Efficient rendering of large kanji lists.
* No unnecessary background processing.

Use indexed queries or a precomputed local search index if needed.

Avoid loading or rendering the entire library at once when the dataset size makes this inefficient.

---

## 12. Error Handling

The application must handle:

* Missing or corrupt local data.
* IndexedDB initialization failures.
* Storage quota errors.
* Failed initial downloads.
* Missing cached assets.
* Invalid backup files.
* Unsupported backup versions.
* Interrupted imports.
* Service-worker update failures.

Error messages should explain the problem in plain language and provide a recovery option where possible.

The app must not silently reset learning progress after a storage or update failure.

---

## 13. Acceptance Criteria

The initial release is complete when all of the following conditions are met.

### Installation

* [ ] The application can be opened from a public HTTPS URL.
* [ ] Users can add it to an iPhone home screen.
* [ ] Users can add it to an Android home screen.
* [ ] The application displays its own name and icon.
* [ ] It launches in standalone mode where supported.

### Learning

* [ ] Users can browse and search the bundled kanji dataset.
* [ ] Users can view meanings and readings.
* [ ] Users can study kanji using flashcards.
* [ ] Users can record review results.
* [ ] Review scheduling works locally.
* [ ] Favorites and progress persist across restarts.
* [ ] The progress dashboard reflects local data.

### Offline

* [ ] After a successful initial load and caching, the app launches without internet.
* [ ] All core learning features work offline.
* [ ] Progress can be updated offline.
* [ ] No backend API is required for learning.
* [ ] Updating the app does not erase progress.

### Backup

* [ ] Users can export their progress.
* [ ] Users can import a valid backup.
* [ ] Invalid backups are rejected safely.
* [ ] Import supports an explicit merge or replace choice.

### Deployment and privacy

* [ ] The application is deployable as static files.
* [ ] No paid app-store account is required.
* [ ] No backend server is required.
* [ ] No mandatory account or analytics is present.
* [ ] All bundled data sources and licenses are documented.

---

## 14. Implementation Plan

Build the application in the following phases.

### Phase 1 — Foundation

* Set up the frontend project.
* Establish the visual design and navigation.
* Define the kanji data schema.
* Bundle a small sample dataset.
* Implement the kanji library and detail screen.

### Phase 2 — Local persistence

* Set up IndexedDB.
* Implement favorites and learning progress.
* Add database versioning.
* Implement the initial spaced-repetition algorithm.

### Phase 3 — Learning experience

* Implement study sessions.
* Implement due-review selection.
* Add progress statistics.
* Add settings and study targets.

### Phase 4 — PWA and offline support

* Add the web app manifest and icons.
* Implement service-worker caching.
* Verify standalone launch.
* Verify offline behavior on iOS and Android.
* Test first-load and update scenarios.

### Phase 5 — Backup and release

* Implement JSON export and import.
* Validate import and recovery behavior.
* Run the acceptance tests.
* Deploy to static HTTPS hosting.
* Test the deployed application on real devices.

---

## 15. Final Architectural Constraints

These constraints take precedence over convenience or optional feature requests:

1. The core application must not require a backend server.
2. Learning progress must remain on the user's device unless the user explicitly exports it.
3. Core functionality must work offline after initial installation and caching.
4. The application must not require App Store or Google Play distribution.
5. No paid service may be mandatory for the application to function.
6. Static hosting is permitted, but remote execution of core application logic is not required.
7. No update may silently destroy user progress.
8. The application must provide a practical way to back up and restore learning data.
9. All third-party datasets, fonts, and dependencies must have suitable licenses.
10. Platform-specific PWA limitations must be documented and tested on real devices.

**Expected result:** A private, offline-first kanji learning PWA that users can launch from their home screens, with no application backend, no mandatory subscription, and no annual Apple Developer membership fee.

