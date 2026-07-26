# V3 Post-Merge Punch List (Round 2) — Triage

> Status: LOCKED 2026-07-26 — all 5 open questions answered; ready for `/sc:implement`.
> Source: first device pass of the merged V3 build (PRs #31/#32, migrations 0008/0009 applied).

## Items, root causes, and planned fixes

### 1. Trending cards say "Event", not "X saves" — DATA, working as coded
`apps/mobile/app/(tabs)/index.tsx:185-189`: the subtitle is `saveCount > 0 ? "N saves" : (organizerName ?? "Event")`.
Root cause: `event_save_counts` was empty at test time — migrations landed only after `supabase db push`, and any hearts toggled before that never reached the ledger. Trending rail is filled chronologically when no saves exist, so every card hit the fallback.
**Decision (Q1):** keep count-when-present; when saves = 0 fall back to the **event date** (same format as item 2), never the word "Event". Counts appear organically as hearts accumulate now that the ledger is live.

### 2. Home rail cards: replace "Event" fallback with the event date — S
Same lines as item 1. For Your Favorites / Recently Viewed (and the Trending zero-saves fallback), subtitle becomes the formatted start date — **Decision (Q4): "Fri, Jul 11"** — via a helper in `lib/format.ts`.

### 3. Card titles: −2pt font + 2-dot ellipsis — S/M
**Decision (Q2): home rail cards only.** `BannerCard` title (`components/Banner.tsx:171`): `bodyBold14` → 12pt bold. `EventCard` titles are untouched.
2-dot ellipsis (same scope): RN's native truncation always renders "…" and `ellipsizeMode` can't change the glyph — needs a small JS truncation helper (detect overflow via `onTextLayout`, slice + append "..") applied to the rail card title.

### 4. Home tab icon missing circle background — S
Assets on disk: `icons/Atoms/Icon-Sm-Circle-Latte-selected.svg` (latte `#B87832` circle, dark G) and `-unselected.svg` (khakis `#DBD1C3` circle). Figma 2040:9414 (selected) / 2069:11631 (unselected). Replace `GulchGIcon` in `components/TabBar.tsx` with a circle-background variant that switches fill by focus state.

### 5. Calendar view-switch easing — S
`app/(tabs)/calendar.tsx` `switchMode` swaps subtrees instantly. Add a subtle transition (~200ms cross-fade via `Animated` opacity, or `LayoutAnimation.configureNext(easeInEaseOut)` on mode change). Respect reduce-motion.

### 6. Splash pixelated + text missing → revert to static — S
Replace `apps/mobile/assets/splash.png` with `icons/splash_and_home_icon/Frame 5386.png` (1608×3416 — full art with text baked in), and remove the `AnimatedSplash` overlay from `app/_layout.tsx` (native expo-splash-screen only, "for now"). Component + tests can stay for later reuse or be deleted (lean: delete usage, keep file).

### 7. Banner ad ideal image dimensions — ANSWER (no code)
`components/Banner.tsx:142-154`: image ads render full content width at a locked **2:1 aspect ratio**, `resizeMode="contain"` (letterboxed on oreo if the aspect differs). Ideal upload: **exactly 2:1, 2000×1000 px** (1600×800 minimum) PNG/JPG, within the admin upload size limit. Anything not 2:1 shows bars, never crops.

### 8. Tab bar icons filled/colored when selected — S/M
Assets: `icons/Atoms/heart-colored.svg`, `calendar-colored.svg`, `map-01-colored.svg` (filled 24×24 variants), + item 4's home circle. Extend `TabBar` config to selected/unselected icon pairs. **Decision (Q3): Newsletter keeps its current outline treatment when selected** (no filled asset exists).

### 9. Toast on save — everywhere hearts appear — M
**Decision (Q5): every heart toggle outside Event Details shows the toast** — Calendar list, Favorites, and Map venue cards (both the Map tab and the Home compact map). Reuse `components/Toast.tsx`; show "Added to your favorites" only on the transition to saved (not on unsave), same as Event Details. Prefer one shared piece (e.g. a small hook/wrapper around `useSavedEvents.toggle`) over per-screen copies.

### 10. Newsletter WebView: back/forward navigation — M
`app/(tabs)/newsletter.tsx` renders a bare `WebView`; tapping any Substack link strands the user. Add a slim nav bar (back/forward `IconButton`s) driven by a `WebView` ref + `onNavigationStateChange` (`canGoBack`/`canGoForward` enable state).

### 11. Month|Week|List segmented control icons — S
Figma 2099:13280 confirmed: Month + Week use the small calendar glyph, List uses the 3-line menu glyph; selected = oreo stroke on green pill, unselected = khakis stroke. Assets: `icons/calendericons/{calendar,calendar-unselected,menu-02}.svg` (12×12). Extend `SegmentedControl` to render an optional per-segment icon tinted by selection.

### 12. In-app browser dismiss button is "✓", should be "✕" — XS
`lib/openLink.ts:39`: `WebBrowser.openBrowserAsync(url)` defaults iOS `dismissButtonStyle` to "done". Pass `{ dismissButtonStyle: "close" }`.

### 13. Admin: Organizers count card — S
`apps/admin/lib/stats.ts` `getCounts` + `apps/admin/app/page.tsx:60-64` `countCards`: add `organizers` (count of `organizers` table) as a fourth card; grid `sm:grid-cols-3` → responsive 4 (e.g. `sm:grid-cols-2 lg:grid-cols-4`).

## Proposed PR grouping
- **PR 1 — mobile polish** (items 1–6, 8, 9, 11, 12): one branch, single review surface; all UI-only, no schema changes.
- **PR 2 — newsletter nav** (item 10): isolated WebView behavior change.
- **PR 3 — admin organizers count** (item 13): separate app.
(2 and 3 are small; can fold 10 into PR 1 if preferred.)

## Decisions (LOCKED 2026-07-26)
1. **Trending subtitle when saves = 0**: fall back to the event date (never the word "Event").
2. **Title shrink + 2-dot ellipsis scope**: home rail `BannerCard` only (14→12); `EventCard` unchanged.
3. **Newsletter tab icon**: keep current outline treatment when selected (no filled asset).
4. **Card subtitle date format**: "Fri, Jul 11".
5. **Toast on save**: everywhere hearts appear outside Event Details — Calendar, Favorites, Map (tab + Home compact map).
