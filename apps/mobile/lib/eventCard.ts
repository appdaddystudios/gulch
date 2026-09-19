import type { EventListItem } from "./events";
import { formatEventTimeCompact } from "./format";

// Geometry of the shared stacked EventCard (NewsletterPostCard chrome):
// 2px border, 4:3 hero, then a text panel. Lists size cards by content; the
// Home deck needs every card the same height, so it uses the worst-case
// panel below.
export const EVENT_HERO_ASPECT = 4 / 3;
export const EVENT_CARD_BORDER = 2;

// Panel at its tallest: padding 16×2 + time pill 20 + name 2×24 + meta 21 +
// status row 25 (small Badge: 4+1 vertical padding/border each side around a
// 15pt label) + three 4pt gaps.
const PANEL_PADDING = 16;
const PANEL_GAP = 4;
const PILL_HEIGHT = 20;
const NAME_HEIGHT = 2 * 24;
const META_HEIGHT = 21;
const STATUS_HEIGHT = 25;
export const EVENT_CARD_PANEL_HEIGHT =
  2 * PANEL_PADDING +
  PILL_HEIGHT +
  NAME_HEIGHT +
  META_HEIGHT +
  STATUS_HEIGHT +
  3 * PANEL_GAP;

// Hero height for a card of the given outer width (the hero sits inside the
// border on both sides).
export const eventHeroHeight = (cardWidth: number): number =>
  Math.round((cardWidth - 2 * EVENT_CARD_BORDER) / EVENT_HERO_ASPECT);

// Outer height of a card whose panel is fixed at its tallest.
export const eventCardHeight = (cardWidth: number): number =>
  eventHeroHeight(cardWidth) + EVENT_CARD_PANEL_HEIGHT + 2 * EVENT_CARD_BORDER;

export const eventTimeLabel = (event: EventListItem): string =>
  formatEventTimeCompact(event.startAt, {
    endAt: event.endAt,
    customTimeDescription: event.customTimeDescription,
  });

// Second line of every card: the organizer when present, else the venue —
// most events carry no explicit organizer, so the location reads instead.
export const eventMetaLabel = (event: EventListItem): string | null =>
  event.organizerName ?? event.locationName;

// "<name>, <meta>, <time>" for VoiceOver — one utterance per card, and the
// deck container announces its top card with the same text.
export const eventCardLabel = (event: EventListItem): string =>
  [event.name, eventMetaLabel(event), eventTimeLabel(event)]
    .filter((part): part is string => Boolean(part))
    .join(", ");
