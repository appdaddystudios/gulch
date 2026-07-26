import { Pressable, StyleSheet, Text, View } from "react-native";

import { IconButton } from "./IconButton";
import { ArrowLeftIcon } from "./icons";
import {
  dayNumber,
  monthGrid,
  monthYearTitle,
  weekOf,
  type MonthCursor,
} from "../lib/calendar";
import { color, font, radius, space } from "../theme";

const CELL = 48;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type DatePickerProps = {
  readonly cursor: MonthCursor;
  readonly selectedKey: string | null;
  readonly eventDayKeys: ReadonlySet<string>;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onSelectDay: (key: string) => void;
  // When set, renders only the Sunday-start week containing this key
  // (V3 Week view); the arrows then step weeks instead of months.
  readonly weekAnchor?: string;
};

export function DatePicker({
  cursor,
  selectedKey,
  eventDayKeys,
  onPrev,
  onNext,
  onSelectDay,
  weekAnchor,
}: DatePickerProps) {
  const cells = weekAnchor ? weekOf(weekAnchor) : monthGrid(cursor);
  const stepLabel = weekAnchor ? "week" : "month";

  return (
    <View style={styles.container}>
      <View style={styles.monthRow}>
        <IconButton accessibilityLabel={`Previous ${stepLabel}`} onPress={onPrev}>
          <ArrowLeftIcon size={18} color={color.khakis} />
        </IconButton>
        <Text style={styles.monthTitle}>{monthYearTitle(cursor)}</Text>
        <IconButton accessibilityLabel={`Next ${stepLabel}`} onPress={onNext}>
          <View style={styles.flip}>
            <ArrowLeftIcon size={18} color={color.khakis} />
          </View>
        </IconButton>
      </View>

      <View style={styles.grid}>
        {DOW.map((label, index) => (
          <View key={`dow-${index}`} style={styles.dowCell}>
            <Text style={styles.dowLabel}>{label}</Text>
          </View>
        ))}

        {cells.map((key, index) => {
          if (!key) {
            return <View key={`pad-${index}`} style={styles.cell} />;
          }
          const hasEvent = eventDayKeys.has(key);
          const isSelected = key === selectedKey;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ disabled: !hasEvent, selected: isSelected }}
              disabled={!hasEvent}
              onPress={() => onSelectDay(key)}
              style={styles.cell}
            >
              <View
                style={[
                  styles.dateInner,
                  hasEvent && !isSelected ? styles.dateHasEvent : null,
                  isSelected ? styles.dateSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.dateLabel,
                    isSelected
                      ? styles.dateLabelSelected
                      : hasEvent
                        ? null
                        : styles.dateLabelMuted,
                  ]}
                >
                  {dayNumber(key)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  monthRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space.lg,
    width: CELL * 7,
  },
  monthTitle: {
    color: color.white,
    fontFamily: font.bold,
    fontSize: 24,
    letterSpacing: -0.24,
    lineHeight: 30,
  },
  flip: {
    transform: [{ scaleX: -1 }],
  },
  grid: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: CELL * 7,
  },
  dowCell: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: CELL,
  },
  cell: {
    alignItems: "center",
    height: CELL,
    justifyContent: "center",
    width: CELL,
  },
  dowLabel: {
    color: color.khakis,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  dateInner: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  dateHasEvent: {
    borderColor: color.brown300,
    borderWidth: 1.5,
  },
  dateSelected: {
    backgroundColor: color.gulchGreen,
  },
  dateLabel: {
    color: color.white,
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  dateLabelSelected: {
    color: color.oreo,
    fontFamily: font.bold,
  },
  dateLabelMuted: {
    color: color.grey80,
  },
});
