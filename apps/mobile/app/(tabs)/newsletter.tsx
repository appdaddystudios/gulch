import { StyleSheet, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { Header } from "../../components/Header";
import { NewsletterIcon } from "../../components/icons";
import { color } from "../../theme";

export default function NewsletterScreen() {
  return (
    <View style={styles.screen}>
      <Header />
      <View style={styles.body}>
        <EmptyState
          icon={<NewsletterIcon size={48} color={color.gulchGreen} />}
          title="Newsletter"
          subtitle="Subscribe to the GULCH newsletter. Coming soon."
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
