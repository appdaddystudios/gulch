import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Header } from "../../components/Header";
import { IconButton } from "../../components/IconButton";
import { ArrowLeftIcon, NewsletterIcon } from "../../components/icons";
import { captureEvent } from "../../lib/telemetry";
import { color, space } from "../../theme";

const NEWSLETTER_EMBED_URL = "https://gulchmag.substack.com";

export default function NewsletterScreen() {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Substack links navigate inside the WebView; without history controls the
  // user is stranded on whatever page they tapped into (V3 punch list).
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false });

  useEffect(() => {
    captureEvent("newsletter_viewed");
  }, []);

  const retry = () => {
    setHasFailed(false);
    setIsLoading(true);
    setNav({ canGoBack: false, canGoForward: false });
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
          <View style={styles.navBar}>
            <IconButton
              accessibilityLabel="Go back"
              size={36}
              disabled={!nav.canGoBack}
              onPress={() => webViewRef.current?.goBack()}
            >
              <ArrowLeftIcon
                size={16}
                color={nav.canGoBack ? color.khakis : color.brown300}
              />
            </IconButton>
            <IconButton
              accessibilityLabel="Go forward"
              size={36}
              disabled={!nav.canGoForward}
              onPress={() => webViewRef.current?.goForward()}
            >
              <View style={styles.mirrored}>
                <ArrowLeftIcon
                  size={16}
                  color={nav.canGoForward ? color.khakis : color.brown300}
                />
              </View>
            </IconButton>
          </View>
          <WebView
            ref={webViewRef}
            key={reloadKey}
            source={{ uri: NEWSLETTER_EMBED_URL }}
            style={styles.webview}
            onLoadEnd={() => setIsLoading(false)}
            onError={() => setHasFailed(true)}
            onHttpError={() => setHasFailed(true)}
            onNavigationStateChange={(navState) =>
              // Fires repeatedly per load — bail out when nothing changed.
              setNav((prev) =>
                prev.canGoBack === navState.canGoBack &&
                prev.canGoForward === navState.canGoForward
                  ? prev
                  : {
                      canGoBack: navState.canGoBack,
                      canGoForward: navState.canGoForward,
                    },
              )
            }
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
  navBar: {
    flexDirection: "row",
    gap: space.md,
    paddingBottom: space.md,
    paddingHorizontal: space.md,
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
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
