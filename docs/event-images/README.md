# Event Images (Instagram → hero) — Requirements Specification

**Status:** ✅ Requirements discovery complete (2026-06-30). Evidence-based (live IG probes + Figma + DB). Brainstorm output only — no design/implementation. Next: `/sc:design`.
**Decisions locked by stakeholder:** (1) re-hosting organizers' cover image is OK (with attribution + link-back); (2) **single hero for v1, carousel deferred**; (3) **auto-scrape** the Instagram cover image.

## Goal

On the Event Details screen (Figma node `2056-10950`), show a full-bleed **hero image** (with the design's gradient scrim) derived from the event's Instagram `external_link`. Re-host the image on our own storage so rendering never depends on Instagram. Fall back gracefully when no image is available.

## Evidence (verified 2026-06-30)

- **Naive scrape fails:** an unauthenticated browser fetch of an IG post returns a JS shell with **no `og:image`** and no image URLs.
- **Works:** fetching with a `facebookexternalhit` crawler User-Agent returns the `og:image` meta tag → the **single cover image** of the post.
- The returned URL is a **signed, expiring (~days) `cdninstagram.com` CDN URL**, delivered as **HEIC rendered-as-jpg** at ~640×640 (`stp=…dst-jpg…`).
- **Carousels:** `og:image` only yields the first/cover image; full multi-image needs the auth-gated embed/GraphQL route or a paid API → **out of scope (deferred)**.
- **Data:** 1029 events — **976 (95%) Instagram links**, 52 real websites (burnaway.org, gsu.edu, hambidge.org…), 1 null.
- **Figma:** Event Details photo area is a **single hero** with gradient scrim, a top-right external-link button, and no gallery/carousel UI.

## Scope

**In scope (v1):**
- Single cover image per event, auto-scraped from the IG `external_link` cover (`og:image`), re-hosted on our storage, surfaced as a stable image URL on the event.
- Graceful fallback for: non-IG links (52), missing/failed/private/removed posts, and the 1 null link.

**Out of scope (deferred):**
- Multiple images / carousel gallery (revisit when the design adds a gallery).
- Official Meta oEmbed app-review path; paid 3rd-party IG APIs; organizer/admin image upload (possible future fallback source).

## Functional requirements

- **FR1 — Extract cover:** Given an event whose `external_link` is an Instagram post, obtain the post's cover image via the crawler-UA `og:image` route. Server-side only (never from the app).
- **FR2 — Re-host:** Download the image bytes and store them on our own storage; expose a **stable image URL** on the event that does not expire. Convert HEIC → a web/React-Native-friendly format (JPEG/WebP) at a sensible hero resolution.
- **FR3 — Persist reference:** Record the image reference on the event plus provenance (source IG post URL, fetch time, status/source). Re-rendering must never hit Instagram.
- **FR4 — Fallback:** When no cover is obtainable (non-IG link, null, private/removed, fetch failure), the app shows a defined fallback (branded placeholder; org/location image is a possible later enhancement). The screen must never show a broken image.
- **FR5 — Attribution / link-back:** Preserve attribution to the source; the Event Details top-right external-link button links to the original IG post (`external_link`).
- **FR6 — Refresh:** Keep images current with pipeline lifecycle — populate on seed, on new-event webhook, and re-fetch when an event changes or its image is missing. Idempotent.

## Non-functional requirements

- **Legal/ToS posture:** low-res preview, attribution + link-back to the IG post; documented decision that re-hosting is accepted. Fetch server-side with the crawler UA.
- **Resilience & fragility:** the `og:image`/crawler-UA route can break when Meta changes things → must fail soft (fallback), log failures, and be monitorable; a status field distinguishes pending/ok/failed/unavailable.
- **Throughput:** initial backfill across ~976 events must be **batched + rate-limited** to avoid Meta blocking; incremental thereafter.
- **Storage:** images served from a **public-read** bucket (our CDN); only server-role writes; predictable keys (e.g. by event id). Re-hosted asset is permanent (no expiry); re-fetch only on change/missing.
- **Performance (app):** hero loads from our CDN with appropriate dimensions; no client-side scraping, no HEIC on-device decoding.
- **Testing:** TDD ≥90% on the extraction/transform/persist logic (parser for `og:image`, fallback selection, idempotent re-fetch), per existing package gates; fixtures for single-image, non-IG, private/removed, and malformed responses.
- **Security:** no secrets in the app; tolerate hostile/garbage HTML from the source without crashing.

## User stories / acceptance criteria

- As an app user, when I open an event sourced from Instagram, I see its cover photo as the hero within the scrim. *(IG event → hero from our CDN)*
- As an app user, when an event has no obtainable image, I see a clean branded placeholder, never a broken image. *(non-IG / failure → placeholder)*
- As an app user, I can tap the external-link button to open the original Instagram post. *(attribution/link-back)*
- As the system, re-running the pipeline does not duplicate images or re-download unchanged ones. *(idempotent)*
- As the system, a Meta change that breaks scraping degrades to placeholders and is logged — the app does not break. *(fail-soft)*

## Impact map (later phases)

- New Supabase **Storage bucket** (public read) for event images.
- `events` schema: image reference + provenance/status columns (design-phase: exact columns).
- Pipeline (`@gulch/pipeline`) + edge `_shared`/webhook/refresh-tick: cover-fetch + transform + store + status; backfill command for the ~976 existing.
- App (`apps/mobile`) Event Details: hero renders our image URL + scrim + fallback placeholder.

## Open questions / deferred to `/sc:design`

None blocking. Design-phase choices: where fetch runs (Node pipeline vs Deno edge — note crawler-UA fetch + image transcoding/HEIC decode may favor the Node pipeline); image format/resolution/derivatives; exact DB columns + status enum; storage key scheme + bucket policy; placeholder asset; backfill batching/rate-limit parameters; monitoring/alerting for scrape-route breakage.

## First-principles takeaways

1. **Instagram fights this** — only the `og:image` crawler-UA route works unauthenticated, and only for the cover. That single image is exactly what v1's single-hero design needs.
2. **Re-hosting is mandatory, not a choice** — source URLs are signed and expire, so we must own the bytes regardless of posture.
3. **Fragility is inherent** — treat the scrape as best-effort with a hard fallback and monitoring, not a guaranteed pipeline.
4. **95% coverage, not 100%** — 52 website-based events + failures need a first-class fallback from day one.
