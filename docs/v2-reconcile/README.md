# V2 Figma reconciliation

Reconciling the mobile app against the **V2 GULCH App Design** Figma file
(fileKey `hbFadRyJEOcI7mteodhFgg`), which supersedes the v1 file the app was
first built from (`dDlTGANQnQsQW7ey1ZoZPm`).

## Findings (V2 vs shipped app)

- **Design tokens**: unchanged. Same palette (Oreo/Dark Chocolate/Khakis/GULCH
  Green/Latte/Mocha/Beige300/White) and Ubuntu type scale. No theme edits.
- **Event Card Horizontal**: now leads with a **time pill**
  (`Sat Jun 5 · 5pm – 7pm`, dark-chocolate pill) and adds a **circular heart
  "save" button** (44×44) on the right. Name ellipsizes to 2 lines; location is
  dropped from the card (org only). Editor's Pick / RSVP / Sponsored unchanged.
- **Event Details — header**: back (left) + **share + dots-horizontal** (right),
  24px icons, **no GULCH logo**.
- **Event Details — sticky CTA**: collapsed from two buttons to a **single
  "Save to Your Lineup"** button (white, khakis border + khakis hard shadow).
  "Export to Your Calendar" removed.
- **Events Browse List**: events are grouped under **week-range headers**
  (`Jun 28 – Jul 4`) with a divider rule.

## Applied this pass

- `components/icons`: added `HeartIcon`, `DotsHorizontalIcon`.
- `components/EventCard.tsx`: V2 layout — time pill, heart save button
  (`saved` / `onToggleSave` props), 2-line name, org-only meta.
- `components/Header.tsx`: `showLogo` flag + flexible right-action group.
- `app/event/[id].tsx`: header (share + dots, no logo), single styled save
  button, transparent sticky bar.
- `app/(tabs)/calendar.tsx`: `SectionList` grouped by week with header + rule.
- `lib/format.ts`: `formatEventTimeCompact`, `weekStartKey`, `formatWeekRange`.
- `lib/events.ts`: `groupEventsByWeek` + `EventWeekSection`.
- Tests cover all new lib helpers (34 tests, lib 100% lines).

## Deferred (needs the save / lineup feature or is separate work)

- Heart "save" + "Save to Your Lineup" are visual only (no persistence yet);
  wired as no-ops pending a lineup/auth feature.
- Your Lineup populated list (V2 shows real cards) — needs saved-events store.
- Events Browse Calendar (grid) + the 4.x Search states — the next build slices.
- Detail date line still uses Ubuntu (V2 spec is Open Sans — not added).

Verified: typecheck, lint, vitest, `expo export -p ios`.
