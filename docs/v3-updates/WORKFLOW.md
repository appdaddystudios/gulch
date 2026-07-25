# Gulch V3 Update Batch — Implementation Workflow

> Output of `/sc:workflow` (2026-07-25), from `REQUIREMENTS.md`. Plan only — execute with
> `/sc:implement`, one phase per PR, following the repo's PR + review workflow.
> All stakeholder decisions are final: Mapbox pins+cards map, GH Actions image cron,
> PostHog autocapture + taxonomy, in-app browser for ALL links (incl. Instagram),
> newsletter = themed chrome around the Substack `/embed` widget,
> **root native project deletion APPROVED**, `EXPO_PUBLIC_MAPBOX_TOKEN` now in `.env`.
> Sequencing assumption: this batch takes priority; live-theme stays parked (flag if wrong).

## Phase map & dependencies

```
P0 Build hygiene ──┬── P1 Quick wins (UI) ──┐
   (blocks all)    ├── P2 Image pipeline ───┼── P5 Build & TestFlight release
                   ├── P3 Hotspots Map ─────┤
                   └── P4 PostHog ──────────┘
P1–P4 are mutually independent → parallelizable after P0.
Native deps (expo-web-browser, react-native-webview, @rnmapbox/maps) all land before the
single P5 device build — do NOT cut interim TestFlight builds per phase.
```

---

## Phase 0 — Build hygiene (branch: `chore/v3-hygiene`)

**T0.1 Merge `chore/eas-testflight` → `main`.**
Open the PR that was never opened (commits `19ab2a3`, `8edb669`). Conflict risk: `main`'s stray
`fe784c1 "eas"` commit also touched `apps/mobile/app.json` + added `eas.json`. Resolution rules:
keep branch's Sentry `~7.11.0` pin, `nodeLinker: hoisted` (pnpm-workspace.yaml + .npmrc),
version `1.0.0`; on lockfile conflict REGENERATE (`pnpm install`), never hand-merge, and restore
`allowBuilds` placeholders (see memory lesson). ✅ Gate: `pnpm install --frozen-lockfile` exits 0;
21/21 turbo tasks green.

**T0.2 Delete stray root native project (USER-APPROVED 2026-07-25).**
Remove untracked `android/`, `ios/`, `.expo/`, root `app.json` (bundle `com.carlhiggins.gulch`),
root `tsconfig.json`; revert uncommitted root `package.json` + `pnpm-lock.yaml` (drop root
`expo`/`react`/`react-native` deps + `version`). ✅ Gate: `git status` clean of native strays;
frozen install still exits 0; `pnpm --filter mobile exec expo export -p ios` bundles.

**T0.3 App icon flatten.**
Script (PIL/sips) from current `apps/mobile/assets/icon.png`: composite onto opaque
dark-chocolate square (sample the art's own bg), crop out rounded-corner transparency + shadow,
resize 1024×1024, strip alpha. Keep path/`app.json#icon` unchanged.
Optional: `android.adaptiveIcon` (green G foreground / chocolate bg).
✅ Gate: `sips -g hasAlpha` → no; 1024×1024; `npx expo-doctor` clean; visual check of art.

---

## Phase 1 — Quick wins (branch: `feat/v3-quick-wins`)

**T1.1 `lib/openLink.ts`** — single helper wrapping `expo-web-browser`
(`WebBrowser.openBrowserAsync`, which natively offers "open in browser"): validate scheme
(http/https only), fallback to `Linking.openURL` on failure, never throw. TDD: tests for valid /
invalid / null URLs. Replace ALL `Linking.openURL` call sites (`app/(tabs)/index.tsx` organizer
cards, `app/event/[id].tsx` RSVP + share). Instagram links use the same path (decision).
Add dep via `npx expo install expo-web-browser`.

**T1.2 Research banner** — Home "Take the Survey" button gets
`onPress: () => openLink("https://www.gulchmagazine.com/research")` (URL as named constant).

**T1.3 Newsletter tab** — `npx expo install react-native-webview`. Replace EmptyState with:
existing `Header`, `darkChocolate` background, WebView on `https://gulchmag.substack.com/embed`
(constant), `gulchGreen` ActivityIndicator while loading, reuse EmptyState for the error state
with retry. Keyboard-safe; opaque WebView bg matched to theme to avoid white flash.

**T1.4 SearchBar centering** — fix vertical alignment in the 48px pill: drop `lineHeight` from
the input's text style (keep size/family from `body16`), add `textAlignVertical: "center"` +
`includeFontPadding: false` for Android. Verify both `onPress` (Home) and editable (Calendar)
variants with screenshots; check large-font accessibility sizes.

✅ Phase gate: mobile vitest suite green (new tests for openLink + newsletter states), lint,
typecheck, `expo export -p ios` bundles; screenshot diff of search bar.

---

## Phase 2 — Image pipeline reliability (branch: `fix/image-pipeline-drain`)

**T2.1 Pagination fix** — `selectPendingEvents` + `--refresh` query loop with `.range()` pages
(1000/page) until short page; unit tests with >1000 mocked rows. Log total scanned.

**T2.2 Render-gate self-healing** — chosen approach: keep `image_url` on `failed`/`pending`
(pipeline already nulls it on `unavailable`) and relax the app gate from
`imageStatus === "ok"` to `Boolean(imageUrl)` in `EventCard.tsx` + `app/event/[id].tsx`.
Add `onError` fallback to placeholder on the `Image` components. Tests updated.
Rationale: a stale good image beats a green box; `unavailable` correctly nulls the URL.

**T2.3 Retry policy in CLI** — treat `failed` with capped retries (existing behavior re-picks
`failed`; add in-run backoff on 429/5xx: retry once after delay, then leave `failed`).
Keep changes minimal — no schema change.

**T2.4 GitHub Actions cron** — `.github/workflows/images.yml`: `schedule: "0 */6 * * *"` +
`workflow_dispatch`; concurrency group (no overlapping runs); pnpm + node setup mirroring ci.yml;
runs `pnpm --filter @gulch/pipeline run images`; secrets `EXPO_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (add to repo secrets — user action or `gh secret set`); job summary
prints per-status counts (from T2.1's scan log).

**T2.5 Supervised drain + rescue (operational, after merge)** —
run 1: `images` (drains pending + failed, full table post-T2.1);
run 2: one-time `images --refresh` (rescues transient `unavailable`, re-baselines the 158).
Record before/after status counts in the PR.

✅ Phase gate: pipeline vitest green; a manual `workflow_dispatch` run completes green; live
query shows upcoming events ≥90% non-pending; app shows real images for upcoming events.

---

## Phase 3 — Hotspots Map (branch: `feat/hotspots-map`)

**T3.0 Prereq check (do FIRST — can block)** — `@rnmapbox/maps` iOS builds may require a Mapbox
*download* token (secret, `DOWNLOADS:READ` scope) at build time in addition to the runtime
`pk.*` token. Verify current plugin docs; if needed, user creates it and it goes in EAS env
(secret) as e.g. `RNMAPBOX_DOWNLOAD_TOKEN` — never in the bundle.

**T3.1 Data layer** — `lib/mapEvents.ts`: upcoming events (`start_at >= now`) joined to
`locations` lat/lng (nested select like existing `EVENT_SELECT`), zod-validated, grouped by
venue (one pin per venue, N events each). TDD; lib coverage parity.

**T3.2 Native setup** — `npx expo install @rnmapbox/maps` + config plugin in `app.json`;
`EXPO_PUBLIC_MAPBOX_TOKEN` read statically (Expo inlines only dot-notation refs); push var to
EAS `production` + `preview` envs.

**T3.3 Map screen** — replace `app/(tabs)/map.tsx` placeholder: dark Mapbox style tuned to the
brown/green brand, camera on metro Atlanta, `gulchGreen` venue pins with event-count badge,
tap → bottom card (EventCard visual language; swipeable list when a venue has multiple events),
card tap → `/event/[id]`. States: loading spinner, error EmptyState, empty ("No upcoming events
with locations yet."). No user-location permission in v1. Keep Home "Explore Map" banner route.

**T3.4 Device verification** — map cannot render in Expo Go/`expo export`; verify via the P5
preview build on-device (pins vs live data, dark style, perf with ~600 venues).

✅ Phase gate: lib tests green; typecheck/lint; config-plugin prebuild dry-run
(`expo prebuild --no-install` in a scratch copy) succeeds; final visual gate deferred to P5.

---

## Phase 4 — PostHog (branch: `feat/posthog-analytics`)

**T4.1 EAS env** — push `EXPO_PUBLIC_POSTHOG_KEY` + `EXPO_PUBLIC_POSTHOG_HOST` (now in `.env`)
to EAS `production` + `preview` via filtered `eas env:push` (same filtered-file method as before —
never push server secrets).

**T4.2 Provider + autocapture** — initialize PostHog at root `_layout` (extend `initTelemetry`)
with screen tracking wired to expo-router + app lifecycle events. Keep the `captureEvent`
wrapper as the single call surface; no-op behavior stays when key absent (tests exist).

**T4.3 Taxonomy** — instrument via `captureEvent`: `event_viewed` (id, name, source),
`event_saved`/`event_unsaved`, `link_opened` (domain, context), `search_performed` (query_length,
result_count), `map_opened`, `map_pin_tapped`, `newsletter_viewed`, `calendar_view_toggled`,
`survey_banner_tapped`. Document names+props in `docs/v3-updates/ANALYTICS.md`. Non-PII only.

✅ Phase gate: telemetry tests green; events visible in PostHog from the P5 preview build.

---

## Phase 5 — Build & TestFlight release

**T5.0 Pre-build polish (added 2026-07-25, own PR before the build):**
- Splash screen: user-set `app.json#splash` values don't show because the splash is baked
  into the native binary — invisible until a new build. Migrate to the `expo-splash-screen`
  config plugin (SDK 52+ canonical path) with brand image + `#3F220F` background; verify in
  the T5.2 device build.
- EventCard time pill: text sits low in the 20px pill (same iOS lineHeight behavior as the
  T1.4 SearchBar fix) — center it.
- Event details hero: show the FULL image (`contain` letterboxed on brand background) instead
  of `cover` cropping the edges.
- Home promo banners (Hotspots Map, Participate in Research): entire card tappable, not just
  the small button.
- Instagram video playback (user-requested 2026-07-25, built as `feat/ig-video-embed`):
  the `og:video` scrape approach is DEAD — Instagram no longer serves any video URL to
  anonymous clients (verified: no `og:video`, `?__a=1` is 404, embed HTML carries no mp4).
  Shipped design instead: pipeline detects video posts from the canonical `og:url`
  (`/reel/`·`/tv/` vs `/p/`) → `events.is_video` (migration 0006) → details hero shows a
  "Watch video" pill and swaps to Instagram's public `/embed/` player in a WebView
  (`react-native-webview` already shipped — NO new native module). Backfill via
  `images --refresh`.

**T5.1** Version/build-number bump; confirm EAS envs contain: 3 Supabase vars, POSTHOG pair,
`EXPO_PUBLIC_MAPBOX_TOKEN`, `SENTRY_DISABLE_AUTO_UPLOAD=true` (no Mapbox download token
needed — T3.0 confirmed current SDKs are public).
**T5.2** `eas build -p ios --profile preview` → **install on the user's PHYSICAL device
BEFORE any TestFlight submit (user requirement 2026-07-25)**: icon + splash, in-app browser
links, newsletter embed, search bar, event images (post-drain), time-pill centering, full
hero image, banner tap targets, map pins, PostHog live events.
**T5.3** Only after the physical-device pass: production build + `eas submit` (wire
`ascAppId` into `eas.json` while at it — still pending from the June TestFlight session;
first confirm whether that upload ever landed in App Store Connect).
✅ Release gate: TestFlight install works end-to-end on a physical device.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| T0.1 merge conflicts w/ `fe784c1` | Resolution rules above; regenerate lockfile; verify frozen install |
| Mapbox iOS download-token build failure | T3.0 pre-check before any map code |
| Instagram scraping fragility (login walls) | `--refresh` rescue + cron retries; `unavailable` is an acceptable terminal state |
| ASC icon rejection | Alpha stripped + expo-doctor gate in T0.3 |
| WebView/embed rendering quirks | Error state + retry; tested on device in P5 |
| Cron secrets leakage | Service-role key only in GH secrets; never in workflow logs |

## Suggested execution order

P0 → (P2 in parallel with P1) → P3 → P4 → P5. P2 early = user-visible image fix lands fastest
(it's the founder's most visible complaint). Each phase = one PR, scrubbed of AI attribution.
