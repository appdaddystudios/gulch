import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  parseSavedIds,
  SAVED_EVENTS_KEY,
  serializeSavedIds,
  toggleSavedId,
} from "../lib/savedEvents";
import { getDeviceId } from "../lib/deviceId";
import { createMobileSupabase } from "../lib/supabase";
import { captureEvent } from "../lib/telemetry";

type SavedEventsValue = {
  readonly savedIds: ReadonlySet<string>;
  readonly isSaved: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  /** False until the device's saved ids have been read back. */
  readonly hydrated: boolean;
};

const SavedEventsContext = createContext<SavedEventsValue | null>(null);

export function SavedEventsProvider({ children }: { readonly children: ReactNode }) {
  const [ids, setIds] = useState<readonly string[]>([]);
  // Consumers that deal from savedIds (the home deck) must not act on the
  // empty pre-hydration set.
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once from device storage.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SAVED_EVENTS_KEY)
      .then((raw) => {
        if (active) {
          setIds(parseSavedIds(raw));
        }
      })
      .catch(() => {
        // Ignore read errors — start with an empty lineup.
      })
      .finally(() => {
        if (active) {
          setHydrated(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = toggleSavedId(prev, id);
      const added = next.includes(id);
      captureEvent(added ? "event_saved" : "event_unsaved", {
        event_id: id,
      });
      void AsyncStorage.setItem(SAVED_EVENTS_KEY, serializeSavedIds(next)).catch(
        () => {
          // Best-effort persistence; in-memory state still updates.
        },
      );
      // Aggregate save ledger (Trending "X saves") — best-effort, anonymous,
      // idempotent per device so replays can't inflate counts.
      void getDeviceId()
        .then((deviceId) =>
          createMobileSupabase()?.rpc("set_event_saved", {
            p_event_id: id,
            p_device_id: deviceId,
            p_saved: added,
          }),
        )
        .then(null, () => {
          // Counter drift on failure is acceptable; saves stay device-local.
        });
      return next;
    });
  }, []);

  const value = useMemo<SavedEventsValue>(() => {
    const set = new Set(ids);
    return { savedIds: set, isSaved: (id) => set.has(id), toggle, hydrated };
  }, [hydrated, ids, toggle]);

  return (
    <SavedEventsContext.Provider value={value}>
      {children}
    </SavedEventsContext.Provider>
  );
}

export function useSavedEvents(): SavedEventsValue {
  const context = useContext(SavedEventsContext);
  if (!context) {
    throw new Error("useSavedEvents must be used within a SavedEventsProvider");
  }
  return context;
}
