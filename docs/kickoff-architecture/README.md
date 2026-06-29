# Kickoff Architecture

Foundation phase (**Milestone 0**): stand up the monorepo + data pipeline so every later milestone builds against **real Webflow-sourced data** while Figma designs land. **No mobile/admin UI is built in this phase.**

Decisions locked with stakeholder (2026-06-29): **Mapbox** geocoding · **pnpm** workspace · **hybrid** pipeline runtime · planning docs authored directly by Claude Code. Execution of all code/tests/commands goes through the **`codeagent`** skill; Claude Code does intake/planning/verification only.

---

## Monorepo layout (Turborepo + pnpm)

```
gulch/
  apps/
    mobile/                # Expo SDK 56 (verified latest), Expo Router, EAS Build
    admin/                 # Next.js 16 — appdaddystudios stack parity
  packages/
    db/                    # Supabase migrations, RLS, generated TS types
    pipeline/              # Node/TS CLI: Webflow client + Mapbox geocode + seed (Vitest, ≥90%)
    shared/                # zod schemas (Webflow payloads) + domain mappers, shared types
    config/                # eslint, tsconfig, tailwind presets (shared)
  supabase/
    functions/
      webflow-webhook/     # Deno edge fn: collection_item_created receiver (HMAC-verified)
      refresh-tick/        # Deno edge fn: full reconcile, invoked by pg_cron
    migrations/            # SQL (authored under packages/db, applied via supabase CLI)
  .github/workflows/       # ci.yml (+ later eas build)
  turbo.json  pnpm-workspace.yaml  package.json  .env (gitignored)
```

**Two parallel tracks per milestone:** (a) `apps/mobile`, (b) `apps/admin`. Shared logic lives in `packages/*` so both tracks + edge functions reuse one validated mapping layer.

---

## Admin stack parity (from `fontezbrooks/appdaddystudios`, inspected)
Next.js **16.2.2** · React **19** · TypeScript 5 · Tailwind **v4** · **shadcn/ui** (radix-ui, cva, clsx, tailwind-merge) · framer-motion · lucide-react · **Vitest** (unit) · **Playwright + axe-core** (e2e/a11y) · ESLint 9 flat config.
- Reuse its `eslint.config.mjs`, Tailwind v4 + `components.json` (shadcn), `vitest.config`, `playwright.config`, and `app/ components/ lib/ test/ e2e/` structure.
- **Deviation:** appdaddystudios uses **Bun**; our root is **pnpm** (Expo/EAS reliability). Admin deps install identically under pnpm; scripts unchanged. Its Bun-specific `prebuild` (`bun run scripts/prepare-logo.ts`) → port to `tsx` (or keep `bun` if installed).

---

## Data pipeline (hybrid)

```
                ┌──────────────────── Webflow CMS (mother site) ────────────────────┐
                │  616 locations · 1042 events · shows   (v2 API, 100/page paging)    │
                └───────────────┬───────────────────────────────┬────────────────────┘
   one-time / CI                │ webhook: item created          │ daily reconcile
   ┌─────────────────────┐      ▼                                ▼
   │ packages/pipeline   │  supabase/functions/            supabase/functions/
   │  seed + geocode CLI │  webflow-webhook (Deno)         refresh-tick (Deno)
   └─────────┬───────────┘      │  HMAC verify                  │  diff by webflow_last_updated
             │ zod validate     │  zod validate                 │  geocode new/changed (cache)
             ▼                  ▼                                ▼
        Mapbox forward-geocode (Atlanta proximity+bbox bias, cached by sha256(address))
             │                  │                                │
             └───────────► Supabase  UPSERT ON CONFLICT (webflow_item_id)  ◄────────────┘
                              (service_role; locations before events for FK order)
```

1. **Initial seed** — `packages/pipeline` CLI. Paginate all collections → zod-validate at boundary → geocode locations → idempotent upsert. Run locally/CI; safe to re-run.
2. **Daily refresh tick** — Edge fn `refresh-tick`, scheduled via **pg_cron** (e.g. 06:00 ET). Re-fetch, diff against `webflow_last_updated`, upsert changed, soft-handle deletes. Geocode only new/changed addresses (cache hit otherwise).
3. **Webhook** — Edge fn `webflow-webhook`. Webflow `collection_item_created` → verify `x-webflow-signature` HMAC + timestamp → fetch item → geocode if needed → upsert. Near-real-time creates between ticks. **None exist yet → created via API at execution (additive).**
4. **Geocoding** — Mapbox forward geocoding; input = `name_address` + `proximity`/`bbox` Atlanta bias (addresses lack city/state). Persist lat/long + `geocode_status`; `geocode_cache` keyed by normalized-address hash avoids repeat calls. `MAPBOX_TOKEN` (server-only) to be added to `.env`.

**Boundary validation:** every Webflow API response + webhook payload is parsed through a zod schema in `packages/shared` before touching the DB. Edge functions import that shared logic via `npm:` specifiers (Supabase Deno supports them) to avoid divergence.

**Extensions required (reversible):** `postgis` (v-next spatial), `pg_cron` + `pg_net` (refresh tick → edge fn). See open question #8.

---

## CI plan (GitHub Actions)

`ci.yml` on every PR (Turbo-driven, affected-only where possible):
1. **install** — pnpm (frozen lockfile)
2. **lint** — eslint
3. **typecheck** — `tsc --noEmit`
4. **test + coverage gate** — Vitest `--coverage`, **thresholds = 90% (fails the job under 90%, not a warning)**. Edge-function mapping logic tested via shared package; Deno fns get Deno tests.
5. **build** — `turbo build`

Later: `eas-build.yml` (manual/tag) for mobile; Playwright e2e for admin. **All changes land via PR**; branch protection requires green CI. Git **worktrees** used where parallel track work benefits.

---

## Milestone → epic map
| Milestone | Mobile epic | Admin epic | Done when |
|---|---|---|---|
| **M0 Foundation** (this phase) | Expo shell boots on real data | Next.js shell boots on real data | both shells green in CI; pipeline seeded |
| M1 = roadmap v1 | Events List & Lineup | v1 Events/Orgs/Locations Mgmt | both epics done |
| M2 = v2 | Maps & Share | v2 Events/Locations Mgmt | both done |
| … v3–v7 | per `../roadmap/` | per `../roadmap/` | both tracks |

---

## Ordered task list — kickoff phase (post-approval, each via `codeagent`, TDD, PR)
0. Scaffold Turborepo + pnpm workspace; shared `packages/config` (eslint/tsconfig/tailwind); `.gitignore` add `.DS_Store`; CI skeleton (`ci.yml`).
1. `packages/db`: Supabase migrations for **v1 mirror** (locations/events/shows) + RLS + generated types. *(tests: schema + RLS)*
2. `packages/shared`: zod schemas for Webflow Locations/Events/Shows + domain mappers. *(tests-first, ≥90%)*
3. `packages/pipeline`: paginated Webflow client + Mapbox geocoder (cached, Atlanta bias) + seed CLI + upsert. *(tests-first, ≥90%)*
4. **Run the seed** → intake real 616 locations + 1042 events; verify counts + geocode success rate.
5. `supabase/functions/refresh-tick` + pg_cron schedule. *(test shared mapping/diff logic)*
6. `supabase/functions/webflow-webhook` + HMAC verify; create the Webflow `collection_item_created` webhook.
7. `apps/mobile`: Expo SDK 56 + Expo Router shell only (env + Supabase client; **no screens**) — boots against real data.
8. `apps/admin`: Next.js 16 shell (appdaddystudios parity) + Supabase client — boots against real data.
9. Wire **Sentry + PostHog** at shell level (env already present). 
10. CI green end-to-end (lint/typecheck/test+coverage/build) + branch protection.

**Re-pause points:** after task 0 (scaffold), after task 4 (data seeded), and at the M0 epic boundary (both shells) — per the track-by-track sign-off contract.
