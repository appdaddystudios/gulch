import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { VenueMap } from "../../components/VenueMap";
import { captureEvent } from "../../lib/telemetry";
import { color } from "../../theme";

// Full-bleed: no GULCH header, the map runs under the status bar (device
// pass). VenueMap pads its own non-map overlays for the top inset.
export default function MapScreen() {
  useEffect(() => {
    captureEvent("map_opened");
  }, []);

  return (
    <View style={styles.screen}>
      <VenueMap />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: color.darkChocolate,
    flex: 1,
  },
});
