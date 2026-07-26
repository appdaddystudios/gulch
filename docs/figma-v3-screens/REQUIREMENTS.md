# GULCH App Design V3 — Screen Redesign Requirements

> Status: requirements LOCKED 2026-07-26 — all 8 open questions answered; task list approved pending implementation. Ready for `/sc:implement`.
> Source of truth: Figma **GULCH App Design V3** (fileKey `G3WABSvTRsTEf1LTMntQeF`, page 11:2 "🚧 Work in Progress").
> Supersedes the v2 file (`hbFadRyJEOcI7mteodhFgg`).

## Frame map (actual screen frames — the shared URLs pointed at section title labels)

| Screen | Frames |
|---|---|
| 1. Home | `2035:7293` (full), `2099:11633` (scrolled — search collapses to header icon) |
| 2. Events List | `2069:11620` / `2072:7330` / `2074:12064` "Events Browse List + Search" |
| 3. Events Calendar | `2084:12136` Month, `2099:13847` Week |
| 4. Events Search | `2040:12560` default, `2040:13427` focused empty, `2069:11212` focused populated, `2040:13741` blurred populated, `2040:13898`/`2040:14055` no-results |
| 5. Favorites | `2040:14500` list, `2084:11218` empty, `2084:11454` past empty, `2084:11545` upcoming empty, `2084:11954` removed |
| 6. Event Details | `2040:11508`, `2056:10950`, toasts `2073:11684`/`2073:11783`/`2073:12006` |
| 7. Map | `2050:12337` "8.1 Map Coming Soon" |
| 8. Splash | `2081:10811` (burlap texture), `2082:10856` (radial gradient), `2081:10729` gradient-bubbles-1 |

## Out-of-Figma requirements (from user)

- Search bar transforms into a header search icon on scroll (also visible in frame `2099:11633`).
- Home "Hotspots Map" card is replaced with the **live map from the Map screen**, scaled to fit the card, with the same functionality (pins, venue cards).

## Screen-by-screen diff (V3 vs current app)

### Global
- **Tab bar**: `Lineup` tab becomes **Favorites** (heart icon), same slot (4th). Labels: Home, Calendar, Map, Favorites, Newsletter.
- **Header**: stretched `GUL____CH` wordmark; scrolled state shows a search icon on the right.
- Brand palette/typography appear unchanged (dark chocolate, gulch green, Ubuntu); verify tokens via `get_variable_defs` at build time.

### 1. Home (`app/(tabs)/index.tsx`)
Current order: Search → Your Events → Banner Ad → Featured Orgs → Hotspots promo → Trending → Research → Recently Viewed.
V3 order: Search → **Your Favorites** → Banner Ad → **Trending ("X saves")** → **Hotspots Map (live mini-map)** → Recently Viewed → Research → **Featured Orgs (moved last)**.
- "Your Events" → "Your Favorites": cards source from saved events (`useSavedEvents`), not generic upcoming.
- Trending cards show "X saves" — **no save-count data exists** (saves are device-local only). Open question.
- Recently Viewed: needs real on-device view history (currently a TODO placeholder slice).
- Hotspots Map card → embedded scaled live Mapbox map (user requirement).
- Scroll: search bar collapses into header search icon (Reanimated).

### 2. Events List (Calendar tab, list mode — `app/(tabs)/calendar.tsx`)
- Search bar pinned at top (replaces the List/Calendar pill toggle placement).
- Event card restyle: date-time pill, bold title, org · venue line, badge row (**Sponsored** — new, RSVP Required w/ envelope icon, Editor's Pick), circular outlined heart.
- Week-range group headers retained ("Jul 5 – 11") with rule.

### 3. Events Calendar (month/week — same tab)
- **Month | Week | List segmented control** + **Today** button + collapsed search icon in a control bar (replaces logo header in Month/Week modes).
- **List mode (user-confirmed)**: segmented control sits **under the search bar** and is **sticky on scroll**; the search bar collapses to a header search icon on scroll (same as Home) — both controls always reachable.
- **Week view is new.**
- Month grid: event days circled, selected day green; adjacent-month days dimmed.
- **Day stepper** below grid: "Friday, July 11, 2026" with prev/next arrows; defaults to today.

### 4. Events Search (states of the same list)
- Focus/blur, typing w/ clear (X), populated, and two no-results states. Logic mostly exists (debounced filter + no-results empty state); needs V3 styling + clear button + state polish.

### 5. Favorites (replaces Lineup — `app/(tabs)/lineup.tsx` → `favorites.tsx`)
- **Upcoming / Past sections** (split on event start vs now) — new.
- Empty state: green heart, "Save Your Favorites", copy, "Explore Events" button.
- Per-section empty states + removed state (frame 4.5).
- All "Lineup" copy → "Favorites" (incl. Event Details save button).
- Route rename changes `$screen_name` `/lineup` → `/favorites` and `event_viewed.source` `lineup` → `favorites` (telemetry + docs + PostHog insight impact).

### 6. Event Details (`app/event/[id].tsx`)
- Editor's Pick badge overlaid on hero image — new.
- Date/time in a dark outlined pill (currently plain text).
- **"More Information" pill button** (link icon) → external link (share icon stays in header).
- "Organized by" label block; location row unchanged; RSVP Required becomes an icon+text row (not an outline button).
- Sticky bottom button: **"Add to Favorites"** with heart icon (was "Save to Your Lineup" + bookmark).
- **Toast on save** (frames 5.3) — new toast component.

### 7. Map (`app/(tabs)/map.tsx`)
- Figma shows a **"Coming Soon!" empty state** with "Explore Events" button — but the current tab has a fully working Mapbox map, and the user wants that map embedded on Home. Conflict → open question 1.

### 8. Splash
- New GULCH wordmark splash, "another app by app daddy studios" footer. Two art directions: burlap texture vs radial gradient. Native splash (expo-splash-screen) needs a designer-exported static image. Currently uses `assets/icon.png` on `#3F220F`.

## Data / infra implications
- **Save counts ("X saves")**: requires backend aggregation (saves are AsyncStorage-local). Blocked on decision.
- **Sponsored badge**: no `sponsored` field exists on events (only `editors_pick`). Needs migration + admin editor if real.
- **Recently viewed**: on-device store (AsyncStorage, capped, most-recent-first).

## Assets (verified on disk 2026-07-26, repo root `icons/`)
- `icons/splash_and_home_icon/` — `Full-Frame 5385.png` + `Frame 5385 copy.png` (burlap splash art), `homeicon.svg` (new Home tab icon), `Vector.svg` + `Vector-1..4.svg` (GULCH wordmark letter paths — usable for the animated JS splash).
- `icons/Atoms/` — `heart.svg` (Favorites tab/save), `link-03.svg` (More Information), `mail-02.svg` (RSVP envelope), `check-verified-02.svg` (Editor's Pick), `Ellipse 1.svg`.
- `icons/GULCHLogo-HorizontalStretched.svg` — header wordmark (already existed).

## Decisions (LOCKED 2026-07-26)
1. **Map tab**: KEEP the live Mapbox tab (never break userspace). Figma's "Coming Soon" frame is ignored for the tab; the live map additionally embeds in the Home card.
2. **Trending "X saves"**: BUILD the save-count backend (aggregate anonymous save counts; design at implement time — likely a counters table + edge function increment/decrement on save/unsave).
3. **Sponsored badge**: REAL data field — events migration + admin dashboard toggle + card badge render.
4. **Splash**: burlap texture variant (`Full-Frame 5385.png`) as native static splash, PLUS an animated JS splash (wordmark vectors available).
5. **Calendar tab structure**: List mode = logo header + search bar with the **segmented control (Month|Week|List) directly under the search bar, sticky on scroll**; search bar collapses to header search icon on scroll (same behavior as Home) — both always reachable. Month/Week modes use the control-bar layout from frames 3.x.
6. **Home search** tap → Calendar tab search (current behavior kept).
7. **"Explore Events" buttons** (Favorites empty state) → Calendar list view.
8. **Route rename `lineup` → `favorites` CONFIRMED** — `$screen_name` and `event_viewed.source` change going forward; update `docs/v3-updates/ANALYTICS.md` and note for PostHog insights.

## Approved task list

**Phase 0 — Foundation**
1. Pull V3 design tokens (`get_variable_defs`) and update `theme/index.ts` if drifted.
2. Wire new assets into `components/icons` / `assets` (home icon, heart, link, mail, check-verified, splash art).

**Phase 1 — Shared components**
3. `EventCard` restyle (date-time pill, badge row incl. Sponsored, circular heart).
4. `SearchBar` restyle + clear button + focus states.
5. `Header` right-slot search icon (scroll-collapsed state).
6. New `Toast` component.
7. New segmented control (Month/Week/List) + Today button.
8. New day-stepper header component.
9. New `MiniMap` card (live Mapbox, scaled, pins + venue cards functional).

**Phase 2 — Screens**
10. Home: section reorder, Your Favorites from saves, Recently Viewed (on-device history), mini-map card, scroll-collapse search.
11. Calendar tab: 3-mode structure (sticky segmented control under search in List), Week view, day stepper, search states.
12. Favorites: route rename, Upcoming/Past split, empty/removed states, copy sweep.
13. Event Details: hero badge, date pill, More Information button, RSVP row, Add to Favorites + toast.
14. Map tab: unchanged (live map kept); update "Explore Events" destinations → calendar.
15. Splash: burlap native splash (expo-splash-screen) + animated JS splash overlay.

**Phase 3 — Data / telemetry**
16. Recently-viewed AsyncStorage store (capped, most-recent-first).
17. Save-count backend (migration + edge function + client wiring) for Trending "X saves".
18. `sponsored` field migration + admin dashboard toggle + badge render.
19. Telemetry/docs updates (`/favorites` screen name, `favorites` source, ANALYTICS.md).

**Phase 4 — QA**
20. tsc/lint/tests, device pass; branch → PR per phase.
