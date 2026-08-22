# Homepage V3.1 — Swipe Deck replaces Map — Design

> Output of `/sc:design` (2026-08-22), from the `/sc:brainstorm` of the same day.
> Figma: file `G3WABSvTRsTEf1LTMntQeF`, frame `40000060:2346`
> "1. New Homepage with Swipe Deck"; card face node `40000060:2529`.
> No founder answers were received before design; defaults are marked **[assumed]**.
> Design only — implement via `/sc:implement`.

## Requirements

| # | Requirement | Status |
|---|-------------|--------|
| R1 | Home layout reorders to Figma: Search → Banner ad → Trending → **Swipe deck** → Your Favorites → Recently Viewed → Research → Featured Orgs | locked (Figma) |
| R2 | Hotspots Map card removed from home only; Map tab untouched | locked |
| R3 | Deck cards = images of upcoming events | locked |
| R4 | Swipe right = add to favorites; card leaves deck | locked |
| R5 | Swipe left = card goes to bottom of stack (not removed) | locked |
| R6 | Deck engine = `@fontezbrooks/swipedaddy` v0.2.2, integration modelled on TheSouthernShmooze `src/features/swipe/` | locked |
| R7 | Deck contents: upcoming, `image_status = 'ok'` ∧ `image_url` set, `start_at` asc, cap 20, exclude already-favorited at load | **[assumed]** |
| R8 | Left-swipe recycling is infinite within the session; order not persisted | **[assumed]** |
| R9 | Right swipe reuses existing save path (`useSavedEvents` + `set_event_saved` RPC) and the existing save toast; swipe stamps ("SAVE"/"SKIP") over card; no undo | **[assumed]** |
| R10 | Tap card → `/event/[id]?source=home_deck`; gesture-only, no buttons | **[assumed]** (Figma shows none) |
| R11 | Zero eligible events at load → section hidden; deck emptied by saving everything → `EmptyState` "You've saved them all" | **[assumed]** |
| R12 | Card face = Figma `40000060:2529`: 370×370 rounded image, Editor's Pick `Badge` top-centre when `editorsPick`, bottom-left title (2 lines) + organizer + time pill | locked (Figma) |
| R13 | Mobile user auth / per-user favorites out of scope | **[assumed]** |
| R14 | Only frame "1." is in this batch | **[open]** |

## Engine facts that shape the design (verified in swipeDaddy src)

- `SwipeDeck` is **linear**: every swipe does `activeIndex += 1`; no recycle API.
- **Every item in `data` is mounted** as an absolutely-positioned `SwipeableCard`
  (hidden beyond `visibleCards`). Unbounded append = unbounded mounted views.
- `data` may **grow** mid-session (refs list rebuilt); wholesale replacement
  needs a remount (`key` change). `onActiveIndexChange`, `onDeckEnd`, `onCardPress`,
  `onSwipeLeft/Right`, `onSwipeRightIntent`, `renderCard(item, index, progress)`.
- Peers: reanimated ≥4, gesture-handler ≥2.24, worklets ≥0.4. Expo 56 bundled
  versions: reanimated 4.3.1, gesture-handler ~2.31.1, worklets 0.8.3 — none are
  direct deps of `apps/mobile` today.

## Core algorithm — bounded recycle (R5 + mounted-count bound)

State is a pure reducer in `lib/deck.ts`; the engine only ever sees an append-only
`entries` array and a `deckKey`.

```ts
type DeckEntry = { key: string; event: EventListItem; pass: number };
type DeckState = { entries: DeckEntry[]; head: number; deckKey: number; saved: Set<string> };

buildDeck(events, savedIds, cap=20)        // filter R7, map to pass 0
swipeLeft(state)  → entries + [{...top, pass+1, key:`${id}:${pass+1}`}], head+1
swipeRight(state) → head+1, saved+top.id   (nothing appended)
compact(state)    // when head ≥ WINDOW (= 2×cap): entries = entries.slice(head), head = 0, deckKey+1
remaining(state)  = entries.length - head   // 0 ⇒ R11 empty state
```

`compact` runs inside the `onActiveIndexChange` handler after a swipe settles; the
new top card is the same item already at rest, so the remount is visually a no-op.
Mounted cards ≤ cap + WINDOW. Keys stay unique (`id:pass`), satisfying `keyExtractor`.

Save is **idempotent** (guard with `savedIds.has(id)` before `toggle`) — `toggle`
alone would unsave a card the user favorited elsewhere mid-session.

## Architecture

```
app/(tabs)/index.tsx ── loadHome() ──▶ lib/events.ts listDeckEvents(client,{limit:20})
        │                                       (.eq image_status 'ok' .not image_url null, start_at asc)
        ▼
components/HomeDeckSection.tsx ── useHomeDeck(events, savedIds) ── lib/deck.ts (pure)
        │                               │ onSwipeRight → save (useSaveToast) + telemetry
        │                               │ onSwipeLeft  → recycle + telemetry
        │                               │ onCardPress  → router.push(/event/[id]?source=home_deck)
        ▼
  <SwipeDeck data=entries key=deckKey renderCard=… config=DECK_CONFIG/>
        └── components/DeckCard.tsx (face, Figma 2529) + components/SwipeStamps.tsx (progress overlay)
```

### Dependency strategy — **[assumed: vendor as workspace package]**
Two options; brainstorm leaned git-dep, but the CI finding below flips it:

| | `git+ssh://…swipeDaddy.git#v0.2.2` (Shmooze way) | vendor `src/` → `packages/swipedaddy` |
|---|---|---|
| Pipelines touched | EAS pre-install SSH hook + file secret **and** GitHub Actions SSH key (`pnpm install --frozen-lockfile` would fail otherwise) | none |
| Update cost | bump tag | copy ~15 KB, bump `VENDORED_FROM` |
| Fidelity to "use my module" | identical | identical source, pinned commit noted |

Default: **vendor** (`packages/swipedaddy`, `name: @fontezbrooks/swipedaddy`,
`main: src/index.ts`, header comment `Vendored from fontezbrooks/swipeDaddy@v0.2.2
(2e8af29)`). Switch to git-dep = one package.json line + the two SSH secrets; say so
and the implement step will do that instead.

### Install list (`apps/mobile`)
`npx expo install react-native-reanimated react-native-gesture-handler react-native-worklets`
(→ 4.3.1 / ~2.31.1 / 0.8.3). `babel-preset-expo` auto-wires the worklets plugin.
`GestureHandlerRootView` wraps the tree in `app/_layout.tsx`.

## Files

| File | Change |
|------|--------|
| `packages/swipedaddy/{package.json,src/*}` | **new** vendored engine (or git dep — see above). |
| `apps/mobile/package.json` | add `@fontezbrooks/swipedaddy: workspace:*`, reanimated, gesture-handler, worklets. |
| `apps/mobile/app/_layout.tsx` | wrap root in `GestureHandlerRootView style={{flex:1}}`. |
| `apps/mobile/lib/events.ts` | **new** `listDeckEvents(client, {limit})` + test; keeps `listUpcomingEvents` for Trending fill. |
| `apps/mobile/lib/deck.ts` (+ `.test.ts`) | **new** pure reducer above; `DECK_CAP=20`, `DECK_WINDOW=40`. |
| `apps/mobile/hooks/useHomeDeck.ts` | **new**: owns `DeckState`, exposes `{entries, deckKey, top, remaining, onSwipeLeft, onSwipeRight, onIndexChange, onCardPress}`; save via `useSaveToast`; telemetry. |
| `apps/mobile/components/HomeDeckSection.tsx` | **new**: `Section` title-less slot; `SwipeDeck` with `DECK_CONFIG` (start from Shmooze values: `activationOffsetX 12`, `swipeThresholdRatio 0.28`, `visibleCards 3`, `stackOffsetY 14`, `stackScaleStep 0.05`, `exitDistanceRatio 1.5`, spring `{damping 20, mass 0.7, stiffness 220}`); container height `370 + 2×14 + 8`; `EmptyState` when `remaining === 0`; a11y actions `save`/`skip` → `ref.swipeRight()/swipeLeft()`. |
| `apps/mobile/components/DeckCard.tsx` | **new** face (R12): RN `Image` cover (same as `EventCard`), `expo-linear-gradient` bottom scrim, `Badge` Editor's Pick, title `type` tokens 2-line, organizer, time pill via `lib/format.ts`. |
| `apps/mobile/components/SwipeStamps.tsx` | **new**: reads `progress` shared value; right → "SAVE" accent pill, left → "SKIP" muted; opacity ∝ \|progress\|. |
| `apps/mobile/app/(tabs)/index.tsx` | reorder sections per R1; drop `VenueMap` import, `MAP_CARD_HEIGHT`, map `Section`; add `deck` to `HomeData` via `loadHome`; pass `savedIds`. |
| `apps/mobile/components/VenueMap.tsx` | remove `compact` prop + `eventSource="home"` branch (dead after R2); map tab unchanged. |
| `apps/mobile/lib/telemetry.ts` | no change; new events follow `noun_pastTenseVerb`. |

## Telemetry
| Event | Props |
|-------|-------|
| `deck_card_swiped` | `{ event_id, direction: "save" \| "skip", position, pass }` |
| `deck_card_tapped` | `{ event_id }` |
| `deck_compacted` | `{ remaining }` (diagnostic, low volume) |
| `deck_emptied` | `{ saved_count }` |
| `event_viewed` | existing, `source: "home_deck"` |

## Sequence — one swipe

```
pan ≥ 0.28×W right → engine spring-exits card → onSwipeRight(entry)
  → useHomeDeck: if !saved.has(id): toggle(id) (AsyncStorage + set_event_saved RPC) + toast "Saved"
  → reducer swipeRight → head+1 → engine activeIndex already +1 (no data change)
  → captureEvent("deck_card_swiped", {direction:"save", …})
pan left → onSwipeLeft(entry) → reducer swipeLeft → entries grows by 1 (engine mounts it at bottom)
  → onActiveIndexChange(i) → if i ≥ DECK_WINDOW: compact → setState → <SwipeDeck key={deckKey+1}>
```

## Tests (requirement-driven, pure-first)
- `lib/deck.test.ts`: build filters (no image / failed / pending / saved / past excluded; cap 20; order kept);
  swipeLeft appends copy with unique key + pass+1; swipeRight appends nothing and records saved;
  compact triggers at WINDOW, slices, bumps key, preserves order; remaining hits 0 only when all saved;
  full cycle: N lefts → same N cards return in original order.
- `lib/events.test.ts`: `listDeckEvents` query shape (`image_status` eq ok, `image_url` not null, gte now, asc, limit).
- `hooks/useHomeDeck.test.ts` (react-test-renderer, engine mocked as callbacks): right swipe on
  already-saved id does not call `toggle`; telemetry payloads; tap navigates with `source=home_deck`.
- `components/DeckCard.test.tsx`: badge only when `editorsPick`; title/org/time rendered; a11y label.
- Engine itself stays covered by its own jest suite in the vendored package (not run by vitest); do
  **not** render `SwipeDeck` under vitest — reanimated 4 mocks are known-gappy (see learned skill
  `reanimated-jest-shipped-mock-gaps`).
- Device checklist (EAS preview): swipe commits at threshold; vertical scroll of home still works with
  deck in the middle (see risk 1); stack shows 3; save toast fires; VoiceOver actions work; reduce-motion ok.

## Rollout
- **PR 1** `feat(mobile): swipe deck deps + vendored swipedaddy + GestureHandlerRootView` — no UI change;
  proves Metro/EAS build with reanimated 4 + worklets.
- **PR 2** `feat(mobile): home v3.1 — swipe deck replaces map card` — everything else.
- Then fresh EAS preview build → device pass (already the pending next step for V3).

## Risks
1. **Horizontal pan inside the vertical home `ScrollView`.** swipeDaddy sets `activationOffsetX`; if RN's
   native scroll steals gestures, swap home `ScrollView` for `react-native-gesture-handler`'s
   `ScrollView` (drop-in). Verify on device in PR 2.
2. Reanimated 4 + worklets on Expo 56: `expo install` pins matching versions; transitive 4.5.0 / GH 3.0.2
   in root `node_modules` must not win — check `pnpm why` after install (hoisted linker).
3. Image quality: `image_url` is the Instagram-derived hero; 370×370 crop may cut posters — `resizeMode
   cover` + scrim; acceptable for V3.1.
4. Save counts: each right swipe hits `set_event_saved`; failure is swallowed (existing behaviour).
