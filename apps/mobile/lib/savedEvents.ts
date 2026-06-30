// Pure helpers for the saved-events (lineup) store. The React/AsyncStorage
// wiring lives in hooks/useSavedEvents.tsx; this module stays side-effect free
// so it is unit-testable.

export const SAVED_EVENTS_KEY = "gulch.savedEventIds.v1";

export const parseSavedIds = (raw: string | null): readonly string[] => {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
};

export const serializeSavedIds = (ids: Iterable<string>): string =>
  JSON.stringify([...ids]);

// Immutable toggle: add the id if absent, remove it if present.
export const toggleSavedId = (
  ids: readonly string[],
  id: string,
): readonly string[] =>
  ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
