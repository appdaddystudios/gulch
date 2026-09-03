import { useEffect, useState } from "react";

import { DECK_CAP } from "../lib/deck";
import { listDeckEvents, type EventListItem } from "../lib/events";

import type { DbClient } from "@gulch/db";

export type DeckPage = {
  readonly events: readonly EventListItem[];
  // Saved-id count the query reached past; -1 until a page has landed.
  readonly savedCount: number;
};

const EMPTY_PAGE: DeckPage = { events: [], savedCount: -1 };

// Owns the rows the Home deck is dealt from. The base Home page seeds it (and
// re-seeds it on pull-to-refresh); after that, every move of the device's
// saved count fetches a replacement deck page on its own — never the rest of
// Home, never a loading state. useHomeDeck ignores the new page once the deck
// has been touched and re-deals from it while untouched, so a save made
// outside the deck (Calendar, Event Details) refills it instead of shrinking
// it. A swipe inside the deck moves the count too; that fetch is cheap and
// its result is discarded by the frozen deck.
export function useDeckPage(
  client: DbClient | null,
  basePage: DeckPage | null,
  baseFailed: boolean,
  savedCount: number,
): DeckPage {
  const [page, setPage] = useState<DeckPage>(EMPTY_PAGE);

  useEffect(() => {
    if (basePage) {
      setPage(basePage);
    }
  }, [basePage]);

  // A failed base page must not leave the deck waiting forever: settle it
  // with the rows already in hand so it is swipeable again. The carousels
  // surface the error; the deck just stops waiting.
  useEffect(() => {
    if (baseFailed) {
      setPage((prev) => ({ ...prev, savedCount }));
    }
  }, [baseFailed, savedCount]);

  const stale = page.savedCount >= 0 && page.savedCount !== savedCount;
  useEffect(() => {
    if (!client || !stale) {
      return;
    }
    let cancelled = false;
    listDeckEvents(client, { limit: DECK_CAP, excludeCount: savedCount })
      .then((events) => {
        if (!cancelled) {
          setPage({ events, savedCount });
        }
      })
      .catch(() => {
        // Same settle rule as a failed base page: keep the rows in hand.
        if (!cancelled) {
          setPage((prev) => ({ ...prev, savedCount }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, stale, savedCount]);

  return page;
}
