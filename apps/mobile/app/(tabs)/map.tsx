import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { Header } from "../../components/Header";
import { VenueMap } from "../../components/VenueMap";
import { captureEvent } from "../../lib/telemetry";
import { color } from "../../theme";

// The map itself lives in components/VenueMap so Home can embed the same
// functionality inside its Hotspots card.
export default function MapScreen() {
  useEffect(() => {
    captureEvent("map_opened");
  }, []);

  return (
    <View style={styles.screen}>
      <Header />
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
