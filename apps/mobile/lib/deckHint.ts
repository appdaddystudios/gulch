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

export type DeckAvailability = {
  readonly dealt: boolean;
  readonly interactive: boolean;
  readonly remaining: number;
  /** Home is the focused route — the deck is actually on screen. */
  readonly focused: boolean;
  /** The app is in the foreground (AppState "active"). */
  readonly foreground: boolean;
};

// A card the engine can actually nudge: dealt, swipeable, still on the table,
// on screen, and in a foregrounded app. `remaining`, `focused` and
// `foreground` matter on their own — the deck can empty (last card saved),
// Home can lose focus (card tapped, tab switched) or the app can be
// backgrounded/locked before the hint's delay elapses, and a nudge nobody
// could see must not consume the one-time flag.
export const isDeckHintable = ({
  dealt,
  interactive,
  remaining,
  focused,
  foreground,
}: DeckAvailability): boolean =>
  dealt && interactive && remaining > 0 && focused && foreground;

export type DeckHintVerdict = "run" | "mark-only" | "skip";

export type DeckHintInput = {
  readonly seen: boolean;
  readonly hintable: boolean;
  readonly reduceMotion: boolean;
};

// "mark-only" honours Reduce Motion: the flag is still written so the hint
// doesn't fire later if the user turns the setting off.
export const shouldRunDeckHint = ({
  seen,
  hintable,
  reduceMotion,
}: DeckHintInput): DeckHintVerdict => {
  if (!hintable || seen) {
    return "skip";
  }
  return reduceMotion ? "mark-only" : "run";
};
