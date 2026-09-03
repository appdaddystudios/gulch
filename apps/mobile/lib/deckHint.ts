import AsyncStorage from "@react-native-async-storage/async-storage";

// One-time "you can swipe this" nudge on the Home deck. The flag lives in
// AsyncStorage like the view history; the decision itself is pure so it can
// be unit-tested without React.

export const DECK_HINT_KEY = "gulch.deckHintShown.v1";
const SEEN = "1";

// Fails closed: if storage can't be read, report the hint as already seen so
// a broken store can never replay the nudge on every launch.
export const hasSeenDeckHint = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(DECK_HINT_KEY)) === SEEN;
  } catch {
    return true;
  }
};

export const markDeckHintSeen = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(DECK_HINT_KEY, SEEN);
  } catch {
    // Best effort — worst case the user sees the nudge once more.
  }
};

export type DeckHintVerdict = "run" | "mark-only" | "skip";

export type DeckHintInput = {
  readonly seen: boolean;
  readonly dealt: boolean;
  readonly interactive: boolean;
  readonly reduceMotion: boolean;
};

// "mark-only" honours Reduce Motion: the flag is still written so the hint
// doesn't fire later if the user turns the setting off.
export const shouldRunDeckHint = ({
  seen,
  dealt,
  interactive,
  reduceMotion,
}: DeckHintInput): DeckHintVerdict => {
  if (!dealt || !interactive || seen) {
    return "skip";
  }
  return reduceMotion ? "mark-only" : "run";
};
