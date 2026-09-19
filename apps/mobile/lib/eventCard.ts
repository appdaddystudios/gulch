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
// 15pt label) + three 4pt gaps. Every text-bearing row — the pill included,
// which is a minimum height that grows with its label — scales with the
// system font size (React Native scales Text by the window's fontScale);
// only the paddings and gaps are fixed.
const PANEL_PADDING = 16;
const PANEL_GAP = 4;
export const EVENT_CARD_PILL_MIN_HEIGHT = 20;
const NAME_HEIGHT = 2 * 24;
const META_HEIGHT = 21;
const STATUS_HEIGHT = 25;
const PANEL_FIXED = 2 * PANEL_PADDING + 3 * PANEL_GAP;
const PANEL_TEXT =
  EVENT_CARD_PILL_MIN_HEIGHT + NAME_HEIGHT + META_HEIGHT + STATUS_HEIGHT;
export const eventCardPanelHeight = (fontScale = 1): number =>
  PANEL_FIXED + Math.ceil(PANEL_TEXT * Math.max(fontScale, 1));
export const EVENT_CARD_PANEL_HEIGHT = eventCardPanelHeight();

// Hero height for a card of the given outer width (the hero sits inside the
// border on both sides).
export const eventHeroHeight = (cardWidth: number): number =>
  Math.round((cardWidth - 2 * EVENT_CARD_BORDER) / EVENT_HERO_ASPECT);

// Outer height of a card whose panel is fixed at its tallest for the given
// system font scale.
export const eventCardHeight = (cardWidth: number, fontScale = 1): number =>
  eventHeroHeight(cardWidth) +
  eventCardPanelHeight(fontScale) +
  2 * EVENT_CARD_BORDER;

export const eventTimeLabel = (event: EventListItem): string =>
  formatEventTimeCompact(event.startAt, {
    endAt: event.endAt,
    customTimeDescription: event.customTimeDescription,
  });

// Second line of a card. "organizer" (the default): the organizer when
// present, else the venue — most events carry no explicit organizer, so the
// location reads instead. "venue": always the venue, for the Map, where the
// card stands in for the pin's place.
export type EventMetaMode = "organizer" | "venue";

export const eventMetaLabel = (
  event: EventListItem,
  mode: EventMetaMode = "organizer",
): string | null =>
  mode === "venue"
    ? event.locationName
    : (event.organizerName ?? event.locationName);

export type EventStatus = "Editor's Pick" | "RSVP Required" | "Sponsored";

// The one status a card shows, in this precedence (an Editor's Pick that also
// needs an RSVP shows the pick).
export const eventStatusLabel = (event: EventListItem): EventStatus | null =>
  event.editorsPick
    ? "Editor's Pick"
    : event.ticketsRequired
      ? "RSVP Required"
      : event.sponsored
        ? "Sponsored"
        : null;

// "<name>, <meta>, <time>, <status>" for VoiceOver — one utterance per card
// carrying everything the card shows; the deck container announces its top
// card with the same text.
export const eventCardLabel = (
  event: EventListItem,
  mode: EventMetaMode = "organizer",
): string =>
  [
    event.name,
    eventMetaLabel(event, mode),
    eventTimeLabel(event),
    eventStatusLabel(event),
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
