import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Header } from "../../components/Header";
import { NewsletterIcon } from "../../components/icons";
import { captureEvent } from "../../lib/telemetry";
import { color, space } from "../../theme";

const NEWSLETTER_EMBED_URL = "https://gulchmag.substack.com/embed";

export default function NewsletterScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    captureEvent("newsletter_viewed");
  }, []);

  const retry = () => {
    setHasFailed(false);
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  };

  return (
    <View style={styles.screen}>
      <Header />
      {hasFailed ? (
        <View style={styles.body}>
          <EmptyState
            icon={<NewsletterIcon size={48} color={color.gulchGreen} />}
            title="Newsletter"
            subtitle="Couldn't load the newsletter. Check your connection and try again."
          />
          <View style={styles.retry}>
            <Button label="Try Again" size="s" tone="primary" onPress={retry} />
          </View>
        </View>
      ) : (
        <View style={styles.webviewWrap}>
          <WebView
            key={reloadKey}
            source={{ uri: NEWSLETTER_EMBED_URL }}
            style={styles.webview}
            onLoadEnd={() => setIsLoading(false)}
            onError={() => setHasFailed(true)}
            onHttpError={() => setHasFailed(true)}
          />
          {isLoading ? (
            <View pointerEvents="none" style={styles.loading}>
              <ActivityIndicator color={color.gulchGreen} size="large" />
            </View>
          ) : null}
        </View>
      )}
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
  retry: {
    alignItems: "center",
    marginTop: space.lg,
  },
  webviewWrap: {
    flex: 1,
  },
  webview: {
    backgroundColor: "transparent",
    flex: 1,
  },
  loading: {
    alignItems: "center",
    backgroundColor: color.darkChocolate,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
