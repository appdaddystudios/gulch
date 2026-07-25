# Gulch App — V3 Update Batch: Requirements

> Output of `/sc:brainstorm` (2026-07-25). Requirements only — architecture/design decisions
> belong to a follow-up `/sc:design`, implementation planning to `/sc:workflow`.
> Design source: no new Figma file — all UI must be derived from the existing design system
> (`apps/mobile/theme/index.ts` tokens, existing components: Header, EventCard, BannerCard,
> Button, Badge, EmptyState, SearchBar).

## Decisions locked with stakeholder (2026-07-25)

| Topic | Decision |
|---|---|
| Hotspots Map v1 scope | Event pins at geocoded venues + tappable event cards |
| Map provider | **Mapbox** (`@rnmapbox/maps`) — brand-styled dark map |
| Image queue automation | **GitHub Actions cron** running the existing `@gulch/pipeline images` CLI |
| PostHog scope | Autocapture/screens **plus a core named-event taxonomy** |

## Evidence gathered (verified this session)

- **Icon** (`apps/mobile/assets/icon.png`): referenced correctly by `app.json` (`icon` field), but the
  asset is 1068×1068 **with alpha, pre-rounded corners, and a baked-in drop shadow**. iOS masks its
  own corners (double-rounding) and App Store Connect rejects alpha in the marketing icon.
- **Links**: all external links open via `Linking.openURL` → system browser
  (`app/(tabs)/index.tsx`, `app/event/[id].tsx`). No `expo-web-browser` dependency yet.
- **Images root cause** (items 3 + 8 are the same defect):
  - Live DB: 795 `ok` / 158 `unavailable` / 47 `pending` overall — but of the **15 upcoming
    events, 12 are `pending`** (latest `image_fetched_at` = 2026-06-30).
  - Nothing drains the queue: `webflow-webhook` inserts events at default status `pending` and
    never scrapes; `refresh-tick` only re-marks `pending` when `external_link` changes; the only
    processor is the manual CLI `pnpm --filter @gulch/pipeline run images` (by design —
    `docs/event-images/DESIGN.md` D4/D5). It was run once, on 2026-06-30.
  - Stored `ok` URLs are healthy: public Supabase Storage URLs return HTTP 200 (spot-checked).
  - Known pipeline defects found: (a) `selectPendingEvents` has no pagination and Supabase
    `max_rows = 1000` silently caps a run below the ~1029-event table; (b) `failed`/re-`pending`
    transitions never clear `image_url`, and the app's render gate requires `status === 'ok'`,
    so a previously-good image goes green after any transient failure or link edit;
    (c) `unavailable` is terminal — never retried except via undocumented `--refresh`;
    (d) no 429/backoff handling (contrary to DESIGN.md), so an Instagram rate-limit burst
    poisons rows as `failed`/`unavailable`.
- **Research banner**: the Home "Take the Survey" button has **no `onPress` handler at all**.
- **Newsletter / Map tabs**: EmptyState placeholders only.
- **SearchBar**: text sits low in the 48px pill — the `body16` type preset's line-height inside
  a fixed-height container is the prime suspect.
- **PostHog**: `posthog-react-native` is already a dependency; `lib/telemetry.ts` already
  initializes it when `EXPO_PUBLIC_POSTHOG_KEY` is set (now present in `.env`). No `captureEvent`
  call sites exist yet. Env vars are NOT yet pushed to EAS.
- **Repo hazards for EAS builds** (predates this list, blocks item 1's "shows up in an EAS build"):
  - Branch `chore/eas-testflight` (hoisted pnpm linker, Sentry `~7.11` pin, version 1.0.0 —
    the fixes that made iOS build #3 succeed) is **pushed but never merged**; `main` still has
    Sentry `^8.16.0` and version `0.0.0`.
  - A **stray native project at the repo root** (untracked `android/`, `ios/`, `.expo/`,
    root `app.json` with bundle id `com.carlhiggins.gulch`, root `tsconfig.json`) plus
    uncommitted root `package.json` changes adding `expo`/`react`/`react-native` as root deps.
    Looks like `expo prebuild` was run at the root by mistake. Conflicts with the real app
    (`apps/mobile`, `com.gulch.mobile`).

---

## Milestone 0 — Build hygiene (prerequisite)

**R0.1** Merge (or rebase-and-merge) `chore/eas-testflight` into `main` so EAS builds from `main` succeed.
**R0.2** Remove the stray root-level native project (`android/`, `ios/`, `.expo/`, root `app.json`,
root `tsconfig.json`) and revert the uncommitted root `package.json`/lockfile changes
(root must not depend on `expo`/`react-native`). ⚠ Destructive — needs explicit user confirmation.
**R0.3** App icon: produce a full-bleed, square-cornered, opaque 1024×1024 PNG (dark-chocolate
background to the edges, no shadow) from the supplied art; keep `app.json#icon` pointing at
`apps/mobile/assets/icon.png`. Acceptance: `npx expo-doctor` clean; icon renders with iOS-applied
corners in an EAS build/TestFlight install; no alpha channel in the shipped asset.
(Nice-to-have: `android.adaptiveIcon` foreground/background split.)

## Milestone 1 — Quick wins (existing screens)

**R1.1 In-app browser for all external links.** Every externally-opened URL (event RSVP/
`external_link`, organizer Instagram, research banner, share fallbacks) opens in an in-app
browser sheet (`expo-web-browser`; SFSafariViewController on iOS) which natively includes an
"open in browser" affordance. Centralize in one helper (e.g. `lib/openLink.ts`) so no call site
uses `Linking.openURL` directly. Acceptance: tapping any link keeps the user in the app; the
sheet offers opening in the system browser; helper unit-tested.
**R1.2 Research banner link.** Home "Participate in Research" → "Take the Survey" opens
`https://www.gulchmagazine.com/research` via R1.1's helper. Acceptance: tap opens the page in-app.
**R1.3 Newsletter tab.** Replace the placeholder with the Substack embed
`https://gulchmag.substack.com/embed` rendered in-app (requires `react-native-webview`), framed
by the existing Header and themed background so the sparse embed page looks intentional.
Acceptance: user can subscribe without leaving the app; loading/error states styled with
existing tokens; page scrolls/keyboard behaves correctly.
**R1.4 SearchBar vertical centering.** Placeholder and typed text are optically centered in the
pill on iOS and Android (fix the line-height/height interaction; verify with the screenshot case).
Acceptance: side-by-side screenshot matches the design intent; no clipping at large font sizes.

## Milestone 2 — Image pipeline reliability (items 3 + 8)

**R2.1 Drain the backlog now.** One supervised run of the images CLI processes all `pending` +
`failed` rows (fixing R2.3 first so the whole table is scanned). Acceptance: upcoming events show
real images in-app except genuinely `unavailable` ones.
**R2.2 Automate the queue.** GitHub Actions scheduled workflow (~every 6h + manual dispatch) runs
`pnpm --filter @gulch/pipeline run images` with `EXPO_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` as repo secrets. Acceptance: a new Webflow event gets its image
without human action within one cycle; workflow failures are visible (red run).
**R2.3 Fix the 1000-row cap.** Paginate `selectPendingEvents` (and `--refresh`) past Supabase
`max_rows`. Acceptance: a run reports scanning the full table (~1029+).
**R2.4 Fix status regressions hiding good images.** Either clear `image_url` on non-`ok`
transitions or render any stored `image_url` regardless of transient status (decide in design);
plus retry policy: `failed` retried with backoff/cap; one-shot `--refresh` rescue pass over the
158 `unavailable` rows (many may be transient login-wall casualties). Acceptance: an event that
once had an image never regresses to placeholder without cause; unavailable count re-baselined.
**R2.5 Observability.** The workflow run summary logs counts per status transition so pending
build-up is detectable. (PostHog is client-side; server-side counts in logs are sufficient.)

## Milestone 3 — Hotspots Map (item 4)

**R3.1 Map screen v1 (Mapbox).** The Map tab renders a brand-styled (dark) Mapbox map centered
on Atlanta showing pins for **upcoming events** at their geocoded venues (594 venues have
coords). Tapping a pin surfaces the event as a card (existing EventCard visual language) linking
to the detail screen. Multiple events at one venue must be handled (stack/cluster or callout list).
**R3.2 Home entry point.** The existing Home "Hotspots Map" promo banner keeps routing to the tab.
**R3.3 States.** Loading, error, empty ("no upcoming events with locations"), and
location-permission-free operation (v1 needs no user location; if a user-location dot is shown it
must degrade gracefully when permission is denied).
**R3.4 Token prerequisite (user action).** Mapbox **public** token (`pk.*`) created and supplied as
`EXPO_PUBLIC_MAPBOX_TOKEN` (the existing `MAPBOX_TOKEN` is a server-only secret and must not ship).
`@rnmapbox/maps` requires a native module + config plugin → needs a new EAS build (cannot ship OTA).
Acceptance: map renders on a physical device via TestFlight; pins reflect live Supabase data.

## Milestone 4 — PostHog analytics (item 9)

**R4.1 Activation.** PostHog initializes in production builds: `EXPO_PUBLIC_POSTHOG_KEY`/`_HOST`
pushed to EAS `production` + `preview` envs (values already in local `.env`). Verify events arrive
in the PostHog project from a real build.
**R4.2 Autocapture.** Enable screen tracking + app lifecycle events via the PostHog provider.
**R4.3 Core event taxonomy** (all via the existing `captureEvent` wrapper; names snake_case,
properties minimal + non-PII): `event_viewed` (event id/name, source screen), `event_saved` /
`event_unsaved`, `link_opened` (url domain, context), `search_performed` (query length, result
count), `map_opened` + `map_pin_tapped`, `newsletter_viewed`, `calendar_view_toggled`,
`survey_banner_tapped`. Acceptance: each event visible in PostHog with documented properties;
taxonomy documented in `docs/v3-updates/` for future funnels.

## Non-functional requirements

- All new UI uses existing theme tokens/components — no new colors/typography outside
  `apps/mobile/theme/index.ts`; screens must remain consistent with the V2 Figma-derived system.
- Tests: lib/helper logic (openLink, map data selectors, pipeline pagination) unit-tested;
  existing coverage gates stay green (turbo lint/typecheck/test).
- No server secrets in the mobile bundle (Mapbox public token only; service-role key stays in
  GH secrets / server).
- `react-native-webview`, `expo-web-browser`, `@rnmapbox/maps` are native deps → require a new
  EAS build; sequence app-store-visible changes accordingly.

## Open questions (non-blocking; defaults will be used unless overridden)

1. **Instagram links** (organizer cards, event RSVP → instagram.com): default = in-app browser
  like everything else. Alternative: deep-link into the Instagram app when installed.
2. **Newsletter framing**: default = Header + themed chrome around the bare `/embed` subscribe
  widget. Alternative: load the full `gulchmag.substack.com` publication in the WebView.
3. **R0.2 confirmation**: explicit go-ahead required before deleting the stray root native
  project and reverting root `package.json`.
4. **Sequencing vs live-theme feature**: the previously-designed live admin theming
  (`docs/live-theme/DESIGN.md`) was slated to ship before TestFlight. Does this V3 batch now
  take priority, or does live-theme still ship first?

## Out of scope (this batch)

Live-theme implementation, auth/lineup cloud sync, Recently Viewed device history,
Android store submission, 'unlocatable' venue status work.
