import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { CloseIcon, SearchIcon } from "./icons";
import { color, hardShadow, radius, space, type as typePreset } from "../theme";

const DEFAULT_PLACEHOLDER = "Search by event, location, or organization";

type SearchBarProps = {
  readonly value?: string;
  readonly onChangeText?: (text: string) => void;
  readonly placeholder?: string;
  readonly onPress?: () => void;
  readonly editable?: boolean;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = DEFAULT_PLACEHOLDER,
  onPress,
  editable = true,
}: SearchBarProps) {
  // When `onPress` is provided the bar acts as a tap target (e.g. navigate to a
  // dedicated search screen) rather than a live input.
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="search"
        onPress={onPress}
        style={styles.container}
      >
        <SearchIcon size={18} color={color.grey80} />
        <View style={styles.inputWrapper}>
          <TextInput
            editable={false}
            placeholder={placeholder}
            placeholderTextColor={color.grey80}
            pointerEvents="none"
            style={styles.input}
            value={value}
          />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <SearchIcon size={18} color={color.grey80} />
      <View style={styles.inputWrapper}>
        <TextInput
          accessibilityRole="search"
          editable={editable}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.grey80}
          returnKeyType="search"
          style={styles.input}
          value={value}
        />
      </View>
      {value && onChangeText ? (
        <Pressable
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onChangeText("")}
        >
          <CloseIcon size={18} color={color.grey80} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...hardShadow,
    alignItems: "center",
    backgroundColor: color.white,
    borderColor: color.oreo,
    borderRadius: radius.pill,
    borderWidth: 2,
    flexDirection: "row",
    gap: space.sm,
    height: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  inputWrapper: {
    flex: 1,
  },
  input: {
    ...typePreset.body16,
    color: color.oreo,
    includeFontPadding: false,
    // An explicit lineHeight bottom-aligns TextInput text on iOS — let the
    // input center its single line naturally inside the 48px pill instead.
    lineHeight: undefined,
    padding: 0,
    textAlignVertical: "center",
  },
});
