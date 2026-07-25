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
import { captureEvent } from "../lib/telemetry";

type SavedEventsValue = {
  readonly savedIds: ReadonlySet<string>;
  readonly isSaved: (id: string) => boolean;
  readonly toggle: (id: string) => void;
};

const SavedEventsContext = createContext<SavedEventsValue | null>(null);

export function SavedEventsProvider({ children }: { readonly children: ReactNode }) {
  const [ids, setIds] = useState<readonly string[]>([]);

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
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = toggleSavedId(prev, id);
      captureEvent(next.includes(id) ? "event_saved" : "event_unsaved", {
        event_id: id,
      });
      void AsyncStorage.setItem(SAVED_EVENTS_KEY, serializeSavedIds(next)).catch(
        () => {
          // Best-effort persistence; in-memory state still updates.
        },
      );
      return next;
    });
  }, []);

  const value = useMemo<SavedEventsValue>(() => {
    const set = new Set(ids);
    return { savedIds: set, isSaved: (id) => set.has(id), toggle };
  }, [ids, toggle]);

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
