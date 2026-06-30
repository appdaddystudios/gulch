import { StyleSheet, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { Header } from "../../components/Header";
import { LineupIcon } from "../../components/icons";
import { color } from "../../theme";

export default function LineupScreen() {
  return (
    <View style={styles.screen}>
      <Header />
      <View style={styles.body}>
        <EmptyState
          icon={<LineupIcon size={48} color={color.gulchGreen} />}
          title="Your Lineup"
          subtitle="Save events you love and they'll show up here. Coming soon."
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
