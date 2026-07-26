import { useEffect, useState } from "react";
import type {
  NativeSyntheticEvent,
  StyleProp,
  TextLayoutEventData,
  TextStyle,
} from "react-native";
import { StyleSheet, Text } from "react-native";

// Native truncation always renders the single "…" glyph; the V3 spec wants two
// dots. A hidden unconstrained copy measures where the text wraps, and the
// visible single line is sliced manually with ".." appended.
const ELLIPSIS = "..";
// Characters dropped from the measured first line to make room for the dots.
const TRIM_CHARS = 3;

type TwoDotTextProps = {
  readonly text: string;
  readonly style?: StyleProp<TextStyle>;
};

export function TwoDotText({ text, style }: TwoDotTextProps) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    setDisplay(text);
  }, [text]);

  const onMeasure = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const lines = event.nativeEvent.lines;
    const first = lines[0]?.text ?? "";
    if (lines.length > 1 && first.length > TRIM_CHARS) {
      setDisplay(`${first.slice(0, -TRIM_CHARS).trimEnd()}${ELLIPSIS}`);
    }
  };

  return (
    <>
      <Text numberOfLines={1} ellipsizeMode="clip" style={style}>
        {display}
      </Text>
      <Text
        accessible={false}
        importantForAccessibility="no"
        style={[style, styles.measure]}
        onTextLayout={onMeasure}
      >
        {text}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  measure: {
    left: 0,
    opacity: 0,
    pointerEvents: "none",
    position: "absolute",
    right: 0,
    top: 0,
  },
});
