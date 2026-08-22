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

`src/SwipeableCard.tsx`, gesture commit: the swipe is committed in `onEnd`
(which runs only for a gesture that ended successfully) and `onFinalize` does
nothing but restore an uncommitted card. `onBegin` also clears
`nextActiveIndex`. Committing in `onFinalize` fired for cancelled and failed
pans too: a tap or an activation-offset-failed pan was judged against a stale
threshold (and `Math.sign(0)` fell through the left branch), and a pan
cancelled past the threshold — app backgrounded, competing native gesture —
committed a swipe the user never completed.

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

`src/use-swipe-controls.ts`, unmount: the cleanup clears the timer array in
place. `cancelPendingResets` used to replace the array, leaving the unmount
cleanup holding an empty one while live stagger timers kept the JS thread
awake for up to `(count - 1) * 100ms` after unmount.

`src/SwipeableCard.tsx`, commit timing: a gesture commit runs the exit
animation and advances `activeIndex` on the UI thread, scheduling only the
consumer notification onto JS. Advancing inside the scheduled callback left
the card active while the JS thread was busy, so a second gesture could grab
an already-committed card, fail the commit check, and spring the discarded
card back over the real active one.

`src/SwipeableCard.tsx`, imperative order and resize: `swipeLeft()` /
`swipeRight()` run the transition before notifying the consumer (a callback
that calls another deck control was otherwise undone by the advance landing
after it), and a card that has actually exited (tracked explicitly, not inferred from a
nonzero translation) is re-projected when the window widens — its old exit
distance could otherwise leave it visible and swallowing touches meant for the
active card.

Upstream all six into swipeDaddy and re-vendor at the next tag to drop this
note.
