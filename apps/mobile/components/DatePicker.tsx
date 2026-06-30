import { Pressable, StyleSheet, Text, View } from "react-native";

import { ArrowLeftIcon } from "./icons";
import {
  dayNumber,
  monthGrid,
  monthTitle,
  type MonthCursor,
} from "../lib/calendar";
import { color, font, radius, space } from "../theme";

const CELL = 48;
const DOW = ["S", "M", "T", "W", "T", "F", "S"] as const;

type DatePickerProps = {
  readonly cursor: MonthCursor;
  readonly selectedKey: string | null;
  readonly eventDayKeys: ReadonlySet<string>;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onSelectDay: (key: string) => void;
};

export function DatePicker({
  cursor,
  selectedKey,
  eventDayKeys,
  onPrev,
  onNext,
  onSelectDay,
}: DatePickerProps) {
  const cells = monthGrid(cursor);

  return (
    <View style={styles.container}>
      <View style={styles.monthRow}>
        <Text style={styles.monthTitle}>{monthTitle(cursor)}</Text>
        <View style={styles.arrows}>
          <Pressable
            accessibilityLabel="Previous month"
            accessibilityRole="button"
            onPress={onPrev}
            style={styles.arrowButton}
          >
            <ArrowLeftIcon size={18} color={color.oreo} />
          </Pressable>
          <Pressable
            accessibilityLabel="Next month"
            accessibilityRole="button"
            onPress={onNext}
            style={styles.arrowButton}
          >
            <View style={styles.flip}>
              <ArrowLeftIcon size={18} color={color.oreo} />
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.grid}>
        {DOW.map((label, index) => (
          <View key={`dow-${index}`} style={styles.cell}>
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
    height: 96,
    justifyContent: "space-between",
    width: CELL * 7,
  },
  monthTitle: {
    color: color.white,
    fontFamily: font.bold,
    fontSize: 32,
    letterSpacing: -0.32,
    lineHeight: 40,
  },
  arrows: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.lg,
  },
  arrowButton: {
    alignItems: "center",
    backgroundColor: color.khakis,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
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
  cell: {
    alignItems: "center",
    height: CELL,
    justifyContent: "center",
    width: CELL,
  },
  dowLabel: {
    color: color.khakis,
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  dateInner: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  dateSelected: {
    backgroundColor: color.gulchGreen,
  },
  dateLabel: {
    color: color.white,
    fontFamily: font.bold,
    fontSize: 24,
    letterSpacing: -0.24,
    lineHeight: 30,
    textAlign: "center",
  },
  dateLabelSelected: {
    color: color.oreo,
  },
  dateLabelMuted: {
    color: color.grey80,
  },
});
