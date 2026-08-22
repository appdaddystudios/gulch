# Admin Dashboard First Pass — Requirements

> Output of `/sc:brainstorm "the admin dashboard scope"` (2026-07-25). Replaces
> live-theme as the active feature (user deprioritized it). Requirements only —
> architecture/design comes next via `/sc:design`, after the open questions below
> are answered.

## Goal

The founder edits the app homepage's featured content from the admin dashboard —
no app release, no Webflow round-trip — and the dashboard itself looks like the
Gulch brand instead of the current unstyled temporary page. Explicitly a
**first pass**: lean scope, no speculative machinery.

## Ground truth (verified in-repo, 2026-07-25)

| Surface | Today |
|---|---|
| Admin dashboard | `apps/admin` EXISTS: Next.js 16 + Tailwind 4 single page showing Supabase row counts, marked "TEMPORARY — pending Figma design". Server-side Supabase via service role (`lib/supabase.ts`), Sentry + PostHog wired, vitest suite. |
| Research button | Link hardcoded: `RESEARCH_URL = "https://www.gulchmagazine.com/research"` in `apps/mobile/app/(tabs)/index.tsx`. |
| Featured Organizations | `organizers.is_featured = true` in Supabase, alphabetical, limit 9 (`apps/mobile/lib/organizers.ts`). ⚠️ VERIFIED: `is_featured` is written by the Webflow sync (`supabase/functions/_shared/mappers.ts:117` maps the Webflow `is-featured` switch) — direct admin toggles WOULD be clobbered on the next organizer sync (open question 2). |
| Banner Ad | Pure placeholder — `<PromoBanner title="Banner Ad" body="from external org">` hardcoded in the homepage; **no data model exists**. |

## Functional requirements

**FR1 — Editable Research link.** Admin can change the URL behind the homepage
"Participate in Research" button; the app reads it from config with the current
URL as fallback when config is missing/unreachable.

**FR2 — Curated Featured Organizations.** Admin can choose which organizers
appear in the homepage "Featured Organizations" carousel (from the synced
organizers list). Mechanism (flag toggle vs. separate curation table) depends on
open question 2.

**FR3 — Editable Banner Ad.** Admin can manage the homepage banner-ad slot.
Content model TBD (open question 1) — minimum viable: on/off + display content +
tap-through link. App renders it from config; hides the slot when off/empty.

**FR4 — Brand-matched admin theming.** The dashboard adopts the mobile design
system: palette (oreo, darkChocolate, khakis, gulchGreen from
`apps/mobile/theme/`), Ubuntu font, and general visual language (pill radii,
hard offset shadows). Applies to the existing counts page and the new editors.

**FR5 — Safe write path.** Homepage config is publicly readable (anon
read-only RLS) and writable only server-side (service role via Next.js server
actions/route handlers) — same posture the live-theme design already validated.
No public write path.

## Non-functional requirements

- **First-pass simplicity:** config read on app open/refresh is sufficient; no
  Realtime requirement unless the user asks (open question 4).
- **Resilience:** the app must render sensibly with no config row (fallbacks =
  today's hardcoded behavior); malformed config fails safe via Zod at the boundary.
- **No secrets client-side:** service role key stays server-only in admin.
- **Mobile release awareness:** the app-side changes are JS-only but still need a
  build to ship — they ride the next release after the just-submitted v1.0.0.
- **Testing:** admin lib/server logic + mobile config lib TDD'd per repo standard.

## Explicitly out of scope (this pass)

- Live theme/palette editing (deprioritized — docs remain in `docs/live-theme/`)
- Admin authentication/login UI (unless open question 3 changes this)
- Editing events, shows, or locations (Webflow remains their home)
- Realtime push of config changes to open apps

## Decisions (founder, 2026-07-25 — verbatim "1. both and Yes 2. Yes to your recommendation 3. Yes for now 4. yes 5. Not yet local only for now 6. link and label text")

1. **Banner Ad** = BOTH content modes (uploaded image + link, and title/body text
   + link) and YES to an off state that hides the slot entirely.
2. **Featured orgs** = admin-owned curation table (sync-proof); the Webflow
   `is_featured` flag seeds it and stops driving the app afterward.
3. **Auth** = none this pass (server-role writes only, no login UI).
   Superseded 2026-08-22 by docs/admin-auth/DESIGN.md (Clerk + email allowlist).
4. **Freshness** = config read on homepage load is sufficient; no Realtime.
5. **Deployment** = local-only for now (no hosting work in this pass).
6. **Research button** = both the LINK and the button LABEL text are editable
   (current label "Take the Survey"; banner title/body stay hardcoded).
