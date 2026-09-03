# Gulch Mobile Analytics (PostHog)

> Phase 4 of the V3 batch. All capture flows through `apps/mobile/lib/telemetry.ts` —
> `captureEvent` / `captureScreen` are the only call surfaces. Everything no-ops when
> `EXPO_PUBLIC_POSTHOG_KEY` is absent (dev without env, tests). Non-PII only: no user
> identifiers, no free-text queries, no URL paths.

## Configuration

| Piece | Where |
|---|---|
| `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` | `.env` (local) + EAS `production` & `preview` envs |
| Client init | `initTelemetry()` in `app/_layout.tsx`, `captureAppLifecycleEvents: true` |
| Screen tracking | Root layout reports every expo-router pathname change via `captureScreen` (PostHog `$screen`), gated on init so the cold-start screen is captured |

## Automatic events

- `Application Installed` / `Application Updated` / `Application Opened` / `Application Backgrounded` — PostHog lifecycle capture
- `$screen` with `$screen_name` = router pathname (e.g. `/`, `/calendar`, `/map`, `/newsletter`, `/favorites`, `/event/{id}`) — `/favorites` replaced `/lineup` in the V3 redesign (2026-07)

## Named event taxonomy

| Event | Properties | Fired from |
|---|---|---|
| `event_viewed` | `event_id`, `event_name`, `source` (`home` \| `calendar` \| `map` \| `favorites` \| `null` for deep links; `lineup` in pre-V3 data) | `app/event/[id].tsx` once per successful load |
| `event_saved` / `event_unsaved` | `event_id` | `hooks/useSavedEvents.tsx` toggle |
| `link_opened` | `domain` (hostname only; the URL scheme — `maps`, `comgooglemaps`, `geo` — for maps-app links), `context` (`organizer_instagram` \| `research_banner` \| `event_share` \| `event_more_information` \| `banner_ad` \| `event_location` \| `null`), `provider` (`apple` \| `google`, only with `event_location`) | `lib/openLink.ts` — every external link; `lib/openInMaps.ts` for the Event Details venue tap |
| `search_performed` | `query_length`, `result_count` (never the query text) | Calendar search, debounced 1s |
| `map_opened` | — | Map tab mount |
| `map_pin_tapped` | `venue_id`, `venue_name`, `event_count` | Venue pin select (not deselect) |
| `newsletter_viewed` | — | Newsletter tab mount |
| `calendar_view_toggled` | `mode` (`month` \| `week` \| `list`; `calendar` in pre-V3 data) | Calendar segmented control, only on actual change |
| `survey_banner_tapped` | — | Home research banner button (also emits `link_opened`) |
| `video_played` | `event_id` | Event details "Watch video" tap (Instagram embed player) |
| `banner_ad_tapped` | `kind` (`image` \| `text`) | Home banner-ad slot tap (link domain arrives via `link_opened`) |
| `favorites_see_more_tapped` | — | Home "See More Favorites" card at the end of the Your Favorites carousel (shown whenever ≥1 favorite) |
| `calendar_export_tapped` | — | Event Details "Add to Calendar" button |
| `calendar_export_result` | `result` (`added` \| `cancelled` \| `unknown` \| `error`; Android always reports `unknown` because the OS sheet doesn't say whether the user saved) | After the system New Event sheet closes |

## Conventions

- Event names: `snake_case`, past tense verbs, subject-first.
- Property names: `snake_case`; values must be primitives or small JSON.
- New events: add here first, then instrument through `captureEvent` — never call
  the PostHog client directly from screens.
