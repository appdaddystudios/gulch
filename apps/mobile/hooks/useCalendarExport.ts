// The Next API's top-level createEventInCalendarAsync throws at runtime; the
// legacy entry point still presents the system "New Event" sheet without a
// permission prompt on iOS 17+ and Android.
// TODO(expo): migrate to ExpoCalendar.addEventWithForm (needs write-only
// permission + a calendar lookup) before the legacy module is removed.
import { createEventInCalendarAsync } from "expo-calendar/legacy";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

import {
  buildCalendarEvent,
  mapDialogResult,
  type CalendarEventSource,
  type CalendarExportResult,
} from "../lib/calendarExport";
import { captureEvent, captureException } from "../lib/telemetry";

export function useCalendarExport(event: CalendarEventSource | null) {
  const [exporting, setExporting] = useState(false);

  const exportToCalendar = useCallback(async () => {
    if (!event || exporting) {
      return;
    }
    setExporting(true);
    captureEvent("calendar_export_tapped");
    let result: CalendarExportResult = "error";
    try {
      const dialog = await createEventInCalendarAsync(buildCalendarEvent(event));
      result = mapDialogResult(dialog.action);
    } catch (error) {
      captureException(error);
      Alert.alert(
        "Couldn't open your calendar",
        "Try again, or add the event by hand from the details above.",
      );
    } finally {
      captureEvent("calendar_export_result", { result });
      setExporting(false);
    }
  }, [event, exporting]);

  return { exporting, exportToCalendar };
}
