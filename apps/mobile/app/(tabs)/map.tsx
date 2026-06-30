import { StyleSheet, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { Header } from "../../components/Header";
import { MapIcon } from "../../components/icons";
import { color } from "../../theme";

export default function MapScreen() {
  return (
    <View style={styles.screen}>
      <Header />
      <View style={styles.body}>
        <EmptyState
          icon={<MapIcon size={48} color={color.gulchGreen} />}
          title="Hotspots Map"
          subtitle="An interactive map of what's happening around Atlanta is coming soon."
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: color.darkChocolate,
    flex: 1,
  },
  body: {
    flex: 1,
    justifyContent: "center",
  },
});
