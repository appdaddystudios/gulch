import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  dayStartIso,
  ROLLOVER_RETRY_MS,
  rolloverDelayMs,
} from "../lib/visibility";

// Calls `onDayChange` once per Atlanta calendar-day rollover while the screen
// is mounted: checked when the app returns to the foreground (iOS keeps the
// app suspended overnight with tab screens mounted) and by a timer armed for
// the next local midnight. Whichever signal fires first wins; the other is a
// no-op because `dayRef` has already moved. Screens pass useQuery's silent
// `refresh`.
//
// The day only commits once a refresh succeeds. A failed one (app resumed
// offline) leaves `dayRef` on the old day, so the next foreground retries and
// a timer retries every ROLLOVER_RETRY_MS while the app stays active;
// `pendingRef` keeps those two signals from issuing two refreshes at once.
// Returns the committed day so a screen can key day-scoped UI on it (Home
// remounts its deck once per rollover).
export function useRefreshOnDayChange(
  onDayChange: () => Promise<boolean>,
): string {
  // The last day whose refresh SUCCEEDED.
  const [day, setDay] = useState(() => dayStartIso(new Date()));
  const dayRef = useRef(day);
  const pendingRef = useRef(false);
  const [failures, setFailures] = useState(0);

  const check = useCallback(async () => {
    const today = dayStartIso(new Date());
    if (today === dayRef.current || pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    const ok = await onDayChange().catch(() => false);
    pendingRef.current = false;
    if (!ok) {
      setFailures((count) => count + 1); // re-arms the retry timer
      return;
    }
    dayRef.current = today;
    setFailures(0);
    setDay(today);
  }, [onDayChange]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        void check();
      }
    });
    return () => subscription.remove();
  }, [check]);

  useEffect(() => {
    const delay =
      failures > 0 ? ROLLOVER_RETRY_MS : rolloverDelayMs(day, Date.now());
    const id = setTimeout(() => void check(), delay);
    return () => clearTimeout(id);
  }, [day, failures, check]);

  return day;
}
