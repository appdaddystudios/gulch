# Admin Dashboard First Pass — Design

> Output of `/sc:design` (2026-07-25), from `REQUIREMENTS.md` with all six founder
> decisions locked. Design only — implement via `/sc:implement`, one phase per PR.

## Architecture at a glance

```
apps/admin (Next.js 16, local-only)          Supabase                    apps/mobile
┌──────────────────────────────┐   service   ┌──────────────────┐  anon  ┌─────────────────┐
│ server actions (Zod-validated)│───role────▶│ homepage_config  │──read─▶│ lib/homeConfig  │
│ + Storage upload (banner img) │            │ featured_orgs    │        │ lib/organizers  │
│ themed UI (mobile tokens)     │            │ banner-ads bucket│        │ Home screen     │
└──────────────────────────────┘            └──────────────────┘        └─────────────────┘
```

Write path is server-only (service role in Next.js server actions) — same posture
as the validated live-theme design. Anon/mobile is read-only via RLS. No auth UI
this pass (decision 3); local-only deployment (decision 5).

## Data model — migration `0007_homepage_config.sql`

**`homepage_config`** — classic single-row config table:

```sql
create table public.homepage_config (
  id smallint primary key default 1 check (id = 1),   -- exactly one row
  research_label text not null default 'Take the Survey',
  research_url   text not null default 'https://www.gulchmagazine.com/research',
  banner_enabled boolean not null default false,
  banner_title   text,          -- text mode
  banner_body    text,          -- text mode
  banner_image_url text,        -- image mode (public Storage URL)
  banner_link_url  text,        -- tap-through, both modes
  updated_at timestamptz not null default now()
);
insert into public.homepage_config (id) values (1);
```

Banner rendering contract (decision 1 — "both" modes): image mode wins when
`banner_image_url` is set; else text mode when `banner_title` is set; slot hidden
when `banner_enabled = false` or neither content field is set.

**`featured_organizers`** — admin-owned curation (decision 2, sync-proof):

```sql
create table public.featured_organizers (
  organizer_id text primary key
    references public.organizers(webflow_item_id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now()
);
-- seed from the Webflow flag, then the flag stops driving the app:
insert into public.featured_organizers (organizer_id, position)
  select webflow_item_id, row_number() over (order by name) - 1
  from public.organizers where is_featured = true;
```

**RLS (both tables):** enable RLS; `for select using (true)` for anon; NO
insert/update/delete policies → public read-only, service role bypasses for
admin writes. (Identical posture to the event-images pattern.)

**Storage:** public bucket `banner-ads`; admin server action uploads with
`upsert: true` under `banner/<timestamp>.<ext>`; store the public URL (cache-bust
via the timestamped path, mirroring the `?v=` trick used for event images).

## Mobile app changes (JS-only; rides the next build)

- **`lib/homeConfig.ts` (new, TDD):** `HOME_CONFIG_DEFAULTS` = today's hardcoded
  values; `getHomeConfig(client)` selects the single row, Zod-parses, and returns
  defaults on missing row/error — config can never break Home. Exposes
  `bannerAd: { kind: "image" | "text"; ... } | null` resolved per the contract
  above so the screen stays dumb.
- **`lib/organizers.ts`:** `listFeaturedOrganizers` switches to
  `featured_organizers` (order by `position`) with the organizer row embedded;
  empty table = founder cleared it → existing "No featured organizations yet."
  empty state. `is_featured` no longer drives the app.
- **Home screen:** `loadHome` adds `getHomeConfig` to its `Promise.all`; Research
  banner button label + URL come from config (label also used for the
  accessibility label); Banner Ad slot renders image mode (`Image` +
  `Pressable` → `openLink(banner_link_url, "banner_ad")`) or text mode (existing
  `PromoBanner`) or nothing.
- **Analytics:** new `banner_ad_tapped` event (`kind`; link domain arrives via the
  existing `link_opened`) — add to ANALYTICS.md.

## Admin app changes

- **Theming (FR4):** Tailwind 4 `@theme` tokens in `globals.css` mirroring
  `apps/mobile/theme/` (oreo, darkChocolate, khakis, gulchGreen, beige, white)
  plus Ubuntu via `next/font/google` in `layout.tsx`; brand look = dark
  chocolate surfaces, khakis secondary text, pill radii, hard offset shadows
  (2px 2px 0) matching the app. Restyle the existing counts page in the same
  pass; delete the "TEMPORARY" banner.
- **Home content editor** (new section on the dashboard page — keep one page
  unless it crowds):
  - *Research button card:* label + URL inputs (URL validated http/https).
  - *Banner Ad card:* enabled toggle; image upload (preview, server-action
    upload to `banner-ads`) OR title/body inputs; link URL; clear-image control.
  - *Featured Organizations card:* full organizer list (search filter), add /
    remove, reorder via up/down controls (no drag-and-drop dependency).
- **Write path:** Next.js server actions using the existing `createServerSupabase`
  (service role); every action Zod-validates input server-side; mutations
  `revalidatePath` the dashboard. No client-side Supabase writes anywhere.
- **Testing:** lib-level TDD (config read/write helpers, banner resolution,
  reorder logic) with the existing vitest + testing-library setup.

## Explicitly not in this pass

Auth/login, hosting/deployment, Realtime push, editing the Research promo's
title/body (only its button label + link), live-theme palette editing.

## Phasing (each independently shippable, one PR each)

1. **P1 — Schema:** migration 0007 (tables + RLS + seed + bucket), `@gulch/db`
   `Database` type mirror (lesson from PR #25 review), apply live.
2. **P2 — Mobile read path:** `homeConfig` lib + organizers switch + Home wiring.
   Visual no-op until config diverges from defaults (safe to ship first).
3. **P3 — Admin theme:** tokens + Ubuntu + restyle existing page.
4. **P4 — Admin editors:** research/banner/featured cards + server actions +
   Storage upload.
5. **Verify:** local admin run against live Supabase; change each surface and
   confirm on a dev build / next preview build.

Risks: banner image aspect handling on small screens (define a fixed slot ratio
in P2, letterbox on oreo like the details hero); organizer deletions cascade out
of curation automatically (FK `on delete cascade`); Webflow sync can delete a
featured organizer row → curation shrinks gracefully.
