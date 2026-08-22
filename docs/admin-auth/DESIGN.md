# Admin Auth (Clerk) — Design

> Output of `/sc:design` (2026-08-22), from the `/sc:brainstorm` of the same day.
> No founder answers were received before design, so every decision below is the
> brainstorm's recommended default and is marked **[assumed]**. Design only —
> implement via `/sc:implement`, one PR.

## Requirements (locked + assumed)

| # | Requirement | Status |
|---|-------------|--------|
| R1 | Admin at `https://www.gulchapp.com/` must require sign-in | locked |
| R2 | Use Clerk; keys already in `apps/admin/.env` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) | locked |
| R3 | Only 2 email addresses admitted now; more addable later | locked |
| R4 | Allowlist lives in env var `ADMIN_ALLOWED_EMAILS` (comma-separated); add = edit env + redeploy | **[assumed]** — alt: `admin_users` table (no redeploy) — swap later without touching call sites |
| R5 | Sign-in method: Google OAuth only | **[assumed]** — Clerk dashboard toggle, zero code impact |
| R6 | Signed-in but not allowlisted → `/unauthorized` page + sign-out; not blocked at Clerk | **[assumed]** |
| R7 | Basic Auth middleware removed entirely | **[assumed]** |
| R8 | Enforcement at BOTH request edge and every Server Action (service-role writes) | locked by threat model |
| R9 | Hosting unknown (no config in repo) — env vars set on host (Vercel assumed) | **[open]** |
| R10 | Clerk instance type (`pk_test_` dev vs `pk_live_` prod) | **[open]** — prod needs DNS CNAMEs on gulchapp.com |

## Threat model (why R8)

Today `apps/admin/app/actions.ts` calls `requireServiceClient()` (service-role key)
with zero identity check; middleware is a no-op (`ADMIN_BASIC_AUTH` unset). Next.js
middleware has been bypassable for Server Action POSTs before (CVE-2025-29927), and
Clerk's own docs say "protect access as close to the resource as possible." So:
middleware = UX redirect; **the authoritative gate is inside each action and the page**.

## Architecture

```
Browser ──GET /──▶ proxy.ts (clerkMiddleware)          ┐ edge: no session → /sign-in
                     │                                  │
                     ▼                                  │
            app/page.tsx ── await requireAdmin() ───────┤ page: session ∧ allowlisted else redirect
                     │                                  │
        form submit  ▼                                  │
            app/actions.ts ── await assertAdmin() ──────┘ action: session ∧ allowlisted else throw
                     │
                     ▼
            requireServiceClient() → Supabase (service role)   ← unchanged
```

### Packages
- `@clerk/nextjs@^7.8.0` — peer `next ^16.0.10` ✔ (admin on 16.2.9), `react ~19.2.3` ✔.

### Env (`apps/admin/.env`, `.env.example`, host)
| Var | Exists | Purpose |
|-----|--------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk frontend |
| `CLERK_SECRET_KEY` | yes | Clerk backend |
| `ADMIN_ALLOWED_EMAILS` | **new** | `"a@x.com,b@y.com"`; lowercase/trim on parse |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` | new | Clerk routing |
| `ADMIN_BASIC_AUTH` | remove | dead after R7 |

Fail-closed guard: `lib/auth.ts` throws on first use if
`ADMIN_ALLOWED_EMAILS` parses to an empty set — never fail open. (Implemented at first request rather than module load so `next build` does not require the var; security outcome identical.)

## Files

| File | Change |
|------|--------|
| `apps/admin/proxy.ts` | **new** (Next 16 name; replaces `middleware.ts`). `clerkMiddleware(async (auth, req) => { if (!isPublic(req.nextUrl.pathname)) await auth.protect(); })`. `isPublic` = `/sign-in`, `/unauthorized`, `/_next`, static. Plain pathname check — `createRouteMatcher` is deprecated. `config.matcher` = Clerk's standard matcher (skip static assets, include `/api|trpc`). |
| `apps/admin/middleware.ts`, `middleware.test.ts` | **delete** (R7). |
| `apps/admin/lib/allowlist.ts` | **new**, pure: `parseAllowedEmails(raw: string \| undefined): ReadonlySet<string>`, `isAllowedEmail(email: string \| null \| undefined, allowed): boolean`. Normalise: trim, lowercase, drop empties. |
| `apps/admin/lib/auth.ts` | **new**, server-only: `getAdminIdentity()` → `{ userId, email } \| null` using `auth()` then email from `sessionClaims.email` (custom claim) falling back to `currentUser()`; `requireAdmin()` (page use: `redirect("/sign-in")` / `redirect("/unauthorized")`); `assertAdmin()` (action use: `throw new Error("Forbidden")`). |
| `apps/admin/app/layout.tsx` | wrap in `<ClerkProvider>`; add header row with `<UserButton />` (only renders when signed in). |
| `apps/admin/app/sign-in/[[...sign-in]]/page.tsx` | **new**: `<SignIn />`, centred, themed with existing globals (mobile tokens). |
| `apps/admin/app/unauthorized/page.tsx` | **new**: "This account ({email}) isn't on the Gulch admin list." + `<SignOutButton redirectUrl="/sign-in" />`. Uses `getAdminIdentity()` to print email. |
| `apps/admin/app/page.tsx` | first statement: `await requireAdmin();` |
| `apps/admin/app/actions.ts` | every exported action: `await assertAdmin();` before `requireServiceClient()` — `saveResearch`, `saveBanner`, `addFeaturedOrganizer`, `removeFeaturedOrganizer`, `moveFeaturedOrganizerUp/Down`, `toggleEventSponsored`. |
| `apps/admin/.env.example` | add new vars, remove `ADMIN_BASIC_AUTH`. |
| `docs/admin-dashboard/REQUIREMENTS.md` | one-line note: auth decision superseded by this doc. |

### Clerk dashboard configuration (manual, not code)
1. Enable Google OAuth; disable email/password + sign-up if desired (R5).
2. Session token custom claim: `{ "email": "{{user.primary_email_address}}" }` — lets
   `assertAdmin()` run with zero extra API calls. Fallback to `currentUser()` keeps
   it correct if the claim is missing.
3. Optional defence-in-depth: Restrictions → Allowlist, same two emails.
4. Production instance: add `www.gulchapp.com` domain + CNAMEs; set redirect URLs.

## Sequence — happy path vs not-allowlisted

```
user → GET /            proxy: no session → 302 /sign-in
user → Google sign-in   Clerk → session cookie → 302 /
user → GET /            proxy: session ok → page: requireAdmin()
                          email ∈ ADMIN_ALLOWED_EMAILS → render dashboard
                          email ∉ allowlist            → 302 /unauthorized → SignOut
user → submit form      action: assertAdmin() → ok → service write
                                               → throw Forbidden (UI shows error)
```

## Tests (requirement-driven)
- `lib/allowlist.test.ts`: parses 2 emails; trims/lowercases; ignores blanks;
  undefined → empty set; case-insensitive match; null email → false.
- `lib/auth.test.ts` (mock `@clerk/nextjs/server`): no session → redirect `/sign-in`;
  session + allowed → identity; session + not allowed → redirect `/unauthorized`;
  claim missing → falls back to `currentUser()`; `assertAdmin` throws on both deny paths.
- `proxy.test.ts`: public paths skip `auth.protect`; others call it.
- `actions.test.ts` (if not present, add): each action rejects before touching
  `createServiceSupabase` when `assertAdmin` throws (spy on service client factory).
- Boot guard: empty `ADMIN_ALLOWED_EMAILS` → startup throw.

## Rollout
1. Local: dev Clerk instance keys (already in `.env`) + `ADMIN_ALLOWED_EMAILS` with
   founder emails; run, sign in with allowed + non-allowed Google accounts.
2. Host: set the three env vars; deploy; repeat both checks on `www.gulchapp.com`.
3. If keys are `pk_test_`, create prod instance + DNS before public use (R10).

## Risks
- Hosting/deploy pipeline not in repo — env var placement is manual (R9).
- `currentUser()` per action adds latency if the email claim isn't configured; claim
  config is a dashboard step that can be forgotten → fallback covers correctness.
- Upgrading to a table-backed allowlist later: only `lib/allowlist.ts` changes
  (`parseAllowedEmails` → async lookup); callers already await.
