# End-to-end tests (Playwright)

`npm run e2e` builds the app with the private content into `node_modules/.cache/kk-e2e/dist`, serves it
with `vite preview` on **127.0.0.1:4317 only** (never 0.0.0.0; nothing is deployed) and runs every
spec on every device project in parallel (about 3–6 minutes on a laptop). Not part of `npm run check`.

First time: `npx playwright install chromium webkit firefox` (browsers go to the user cache).

Useful variants:

```sh
npm run e2e -- --project iphone-se                # one device
npm run e2e -- typing --project pixel-7           # one spec file on one device
KK_E2E_REUSE=1 npm run e2e                        # reuse a server already running on the port
KK_E2E_SKIP_BUILD=1 sh test/e2e/serve.sh          # serve the last build (then KK_E2E_REUSE=1)
KK_E2E_WORKERS=4 npm run e2e                      # worker count (default 50% of the cores)
npx playwright show-report test/e2e/report        # HTML report, traces of failures
```

## Devices (`playwright.config.ts`)

| project | engine | viewport | stands in for |
| --- | --- | --- | --- |
| iphone-se | WebKit | 375×667 | iPhone SE 2nd/3rd gen (smallest iPhone; keyboard open ≈ 375×410) |
| iphone-15, iphone-15-dark | WebKit | 393×659 | iPhone 15, light and dark |
| iphone-15-pro-max | WebKit | 430×739 | largest iPhone |
| ipad | WebKit | 656×944 | iPad (gen 11) |
| pixel-5, pixel-7, pixel-7-dark | Chromium | 393×727, 412×839 | Android Chrome, light and dark |
| galaxy-s9plus | Chromium | 320×658 | narrow Samsung phone |
| galaxy-s23-samsung | Chromium | 360×780 dpr 3 | Samsung Internet UA |
| android-small-320 | Chromium | 320×568 | small/old Android phone |
| firefox-390, firefox-390-dark | Firefox (desktop engine) | 390×844 | Firefox for Android (no mobile emulation in Playwright) |

## Specs

- `start-and-lessons.spec.ts`: first start (content loads, dashboard counts), a lesson batch
  (presentation → quiz with one wrong answer → summary → dashboard).
- `reviews.spec.ts`: a review session with a correct answer, a wrong one undone with special button 1
  (Advanced settings → Undo), a Don't know, the summary and its item lists.
- `typing.spec.ts`: romaji → kana with key events, `insertText` input events, IME composition
  (Latin and kana), a trailing n, Enter submitting.
- `screens.spec.ts`: curriculum WaniKani → JLPT → WaniKani, browse and romaji search, item page,
  settings and the Advanced gate, About's install hint (browser vs. home screen).
- `progress.spec.ts`: save (download fallback, share sheet), restore (file chooser, summary,
  Cancel, confirm), a bad file, and the owner's Android export (`test/golden/progress/android-export.json`,
  only loaded into the local test browser, never printed).
- `onboarding.spec.ts`: the getting-started guide on a first start (every step, strict layout checks),
  the JLPT path, the level test choice, Skip guide, and a learner with progress (never shown; Settings
  opens it). `openApp(page)` skips the guide for every other spec (`keepOnboarding` keeps it).
- `offline.spec.ts`: service worker on, load, go offline, reload, review.
- `layout.spec.ts`: every main screen with strict checks (soft failures, so one run lists all):
  no sideways scroll, tap targets ≥ 40 px (exemptions by testid), no clipped text; the
  quick-action row: at the bottom of the visible area, also with the keyboard simulated
  (`simulateKeyboard`: visual viewport as iOS / Chrome, or a resized viewport as the Android WebView;
  iPhone SE 410 px visible, 320 px Android 300 px, Pixel 7, iPad, Firefox).
- `session-layout.spec.ts`: the question view's height (unanswered ~133, answered ~193 with Next in it),
  the answered Next focused, a session dialog leaving the focus (keyboard) in the answer field.

The flow specs run the same checks but only record tap-target and clipping findings (annotations
and `screenshots/<project>/findings.txt`); a sideways scroll always fails.

Tests start from known states through the real Restore flow (`helpers/progress.ts` writes progress
files); quiz answers come from the built content DB on the Node side (`helpers/content.ts`), so no
WaniKani text is in these files.

## Output (all git-ignored, never commit: it shows WaniKani content)

- `screenshots/<project>/<screen>.png` and `findings.txt` (cleared at the start of each run)
- `results/` (failure screenshots, traces), `report/` (HTML report)
