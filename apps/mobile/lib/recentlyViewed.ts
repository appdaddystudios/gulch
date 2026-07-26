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

// Most-recent-first, deduped, capped — a re-view moves the event to the front.
export const recordRecentlyViewed = async (id: string): Promise<void> => {
  try {
    const current = parseRecentIds(await AsyncStorage.getItem(RECENTLY_VIEWED_KEY));
    const next = [id, ...current.filter((value) => value !== id)].slice(
      0,
      MAX_RECENT,
    );
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // Best-effort history — a failed write must never break the details view.
  }
};
