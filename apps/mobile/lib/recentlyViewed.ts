import AsyncStorage from "@react-native-async-storage/async-storage";

export const RECENTLY_VIEWED_KEY = "gulch.recentlyViewed.v1";
const MAX_RECENT = 20;

export const parseRecentIds = (raw: string | null): readonly string[] => {
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

export const getRecentlyViewedIds = async (): Promise<readonly string[]> => {
  try {
    return parseRecentIds(await AsyncStorage.getItem(RECENTLY_VIEWED_KEY));
  } catch {
    return [];
  }
};

const performRecord = async (id: string): Promise<void> => {
  try {
    const current = parseRecentIds(await AsyncStorage.getItem(RECENTLY_VIEWED_KEY));
    // Set dedupes the entire list, healing any pre-existing duplicates while
    // moving the fresh id to the front.
    const next = [...new Set([id, ...current])].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // Best-effort history — a failed write must never break the details view.
  }
};

// Read-modify-write cycles are serialized through a module-level queue so
// rapid successive event opens can't interleave and drop each other's entries.
let writeQueue: Promise<void> = Promise.resolve();

// Most-recent-first, deduped, capped — a re-view moves the event to the front.
export const recordRecentlyViewed = (id: string): Promise<void> => {
  writeQueue = writeQueue.then(() => performRecord(id));
  return writeQueue;
};
