import { useEffect, useMemo, useRef, useState } from "react";

import { listEventsByIds, type EventListItem } from "../lib/events";
import { mergeById, missingIds, type EventMap } from "../lib/homeCache";

import type { DbClient } from "@gulch/db";

const EMPTY: EventMap = new Map();

// Fills the gaps in `baseById` for `wantedIds`: fetches only ids neither the
// base page nor this hook has seen, and never exposes a loading state — rows
// land when they land, everything already known stays put. Callers pass
// identity-stable inputs so the effect only fires when they really change.
export function useEventsByIds(
  client: DbClient | null,
  wantedIds: readonly string[],
  baseById: EventMap,
): EventMap {
  const [cache, setCache] = useState<EventMap>(EMPTY);
  const inFlightRef = useRef(new Set<string>());
  // Ids a completed fetch covered, present in the database or not: an event
  // deleted upstream must not be re-requested on every focus.
  const settledRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!client) {
      return;
    }
    const inFlight = inFlightRef.current;
    const settled = settledRef.current;
    const missing = missingIds(wantedIds, baseById, settled, inFlight);
    if (missing.length === 0) {
      return;
    }

    for (const id of missing) {
      inFlight.add(id);
    }
    listEventsByIds(client, missing)
      .then((rows) => {
        for (const id of missing) {
          settled.add(id);
        }
        if (mountedRef.current) {
          setCache((prev) => mergeById(prev, toMap(rows)));
        }
      })
      .catch(() => {
        // Not retried until the wanted ids or the base page change; the next
        // focus or favorite toggle re-triggers naturally.
      })
      .finally(() => {
        for (const id of missing) {
          inFlight.delete(id);
        }
      });
  }, [client, wantedIds, baseById]);

  return useMemo(() => mergeById(baseById, cache), [baseById, cache]);
}

const toMap = (rows: readonly EventListItem[]): EventMap =>
  new Map(rows.map((row) => [row.id, row]));
