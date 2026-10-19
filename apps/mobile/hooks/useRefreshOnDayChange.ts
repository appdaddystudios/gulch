import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { dayStartIso, rolloverDelayMs } from "../lib/visibility";

// Calls `onDayChange` once per Atlanta calendar-day rollover while the screen
// is mounted: checked when the app returns to the foreground (iOS keeps the
// app suspended overnight with tab screens mounted) and by a timer armed for
// the next local midnight. Whichever signal fires first wins; the other is a
// no-op because `dayRef` has already moved. Screens pass useQuery's silent
// `refresh`.
export function useRefreshOnDayChange(onDayChange: () => void): void {
  const dayRef = useRef(dayStartIso(new Date()));
  const [armedFor, setArmedFor] = useState(dayRef.current);

  const check = useCallback(() => {
    const today = dayStartIso(new Date());
    if (today === dayRef.current) {
      return;
    }
    dayRef.current = today;
    setArmedFor(today); // re-arms the timer for the following midnight
    onDayChange();
  }, [onDayChange]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        check();
      }
    });
    return () => subscription.remove();
  }, [check]);

  useEffect(() => {
    const id = setTimeout(check, rolloverDelayMs(armedFor, Date.now()));
    return () => clearTimeout(id);
  }, [armedFor, check]);
}
