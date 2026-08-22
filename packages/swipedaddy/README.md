# @fontezbrooks/swipedaddy (vendored)

Vendored from github.com/fontezbrooks/swipeDaddy @ v0.2.2 (2e8af29) on 2026-08-22.
Do not edit; re-vendor to update.

Headless swipeable card deck for React Native (pan-to-swipe, spring exit,
stacked presentation). Ships raw TypeScript (`main: src/index.ts`) — Metro
transpiles it; no build step.

## Peers (declared by the consumer, not here)

Upstream declares `react >=19`, `react-native >=0.79`,
`react-native-gesture-handler >=2.24`, `react-native-reanimated >=4`,
`react-native-worklets >=0.4` as peerDependencies. They are intentionally NOT
declared in this manifest: pnpm auto-installs a workspace project's own peers
(newest matching → reanimated 4.5.0 / gesture-handler 3.0.2 / worklets 0.10.0)
into `packages/swipedaddy/node_modules`, and Metro's hierarchical lookup would
then bundle a second copy next to the app's SDK-pinned one ("property is not
writable" at startup). `apps/mobile` installs the SDK-matched versions via
`npx expo install`; Metro resolves them from the hoisted root `node_modules`.

## Local divergence from upstream

Two review findings from PR #38 are fixed here but not yet in the upstream
tag.

`src/SwipeableCard.tsx`, gesture commit: the pan gesture clears
`nextActiveIndex` in `onBegin` and ignores a finalize with zero translation.
Without it a gesture that never reaches `onUpdate` (a tap, or a pan that
fails the activation offset) is finalized against a stale commit threshold
left by an earlier gated swipe or `reset()`, and `Math.sign(0)` falls through
the left branch — advancing the deck on a tap.

`src/SwipeableCard.tsx`, `reset()`: a card the deck has already moved past
ignores `reset()`. `reset()` restores the deck through a staggered timer per
card; if the user swipes while that stagger is still running, the pending
timer used to cancel the exiting card's animation and spring a discarded card
back to the centre. Guarding inside the card (rather than cancelling the
timers) keeps the cards still ahead of `activeIndex` restoring normally.

`src/use-swipe-controls.ts`: growing `count` (paginated data) now appends
refs instead of recreating the whole list. Recreating them detached the
handles a pending reset stagger had closed over, so those callbacks saw a
null `ref.current` and left their card unrestored.

Upstream all three into swipeDaddy and re-vendor at the next tag to drop this
note.
