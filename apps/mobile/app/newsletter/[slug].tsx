import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewProps } from "react-native-webview";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Header } from "../../components/Header";
import {
  useNewsletterPost,
  type UseNewsletterPostResult,
} from "../../hooks/useNewsletterFeed";
import { formatPostDate } from "../../lib/format";
import {
  NEWSLETTER_BASE_URL,
  type NewsletterPost,
} from "../../lib/newsletterFeed";
import {
  buildPostDocument,
  shouldAllowDocumentLoad,
} from "../../lib/newsletterHtml";
import { openInBrowser } from "../../lib/openLink";
import { captureEvent } from "../../lib/telemetry";
import { color, space, type as typePreset } from "../../theme";

type LoadRequest = Parameters<
  NonNullable<WebViewProps["onShouldStartLoadWithRequest"]>
>[0];

// Deep-link params are untrusted: only a plain path segment becomes a slug.
const SLUG_PATTERN = /^[A-Za-z0-9._~-]+$/;
// Every scheme a preview link can carry must be listed, or the WebView opens
// it through its own external path and skips handleLoadRequest (no
// link_opened event, no error reporting). The handler intercepts them all.
const ORIGIN_WHITELIST = ["about:*", "https://*", "http://*"];

const toSlug = (value: string | readonly string[] | undefined): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && SLUG_PATTERN.test(raw) ? raw : null;
};

const substackPostUrl = (slug: string | null): string =>
  slug ? `${NEWSLETTER_BASE_URL}p/${encodeURIComponent(slug)}` : NEWSLETTER_BASE_URL;

export default function NewsletterPostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug: string | string[] }>();
  const slug = toSlug(params.slug);
  const state = useNewsletterPost(slug);

  return (
    <View style={styles.screen}>
      <Header showBack showLogo={false} onBack={() => router.back()} />
      <Content state={state} slug={slug} />
    </View>
  );
}

function Content({
  state,
  slug,
}: {
  readonly state: UseNewsletterPostResult;
  readonly slug: string | null;
}) {
  if (state.status === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.gulchGreen} size="large" />
      </View>
    );
  }

  if (state.status === "error" || !state.post) {
    return (
      <View style={styles.centered}>
        <EmptyState
          title="This issue isn't available"
          subtitle={
            state.status === "error"
              ? "Couldn't load the newsletter. Check your connection and try again."
              : "It may have moved. You can still read it on Substack."
          }
          action={
            <View style={styles.actions}>
              {state.status === "error" ? (
                <Button label="Try again" tone="primary" onPress={state.retry} />
              ) : null}
              <Button
                label="Open on Substack"
                tone={state.status === "error" ? "outline" : "primary"}
                onPress={() =>
                  void openInBrowser(substackPostUrl(slug), "newsletter_post")
                }
              />
            </View>
          }
        />
      </View>
    );
  }

  return <PostView post={state.post} />;
}

// The WebView only ever loads a document we generate (JavaScript off,
// incognito); every navigation away goes to the user's default browser.
function PostView({ post }: { readonly post: NewsletterPost }) {
  const insets = useSafeAreaInsets();
  const html = useMemo(
    () =>
      buildPostDocument(post, { dateLabel: formatPostDate(post.publishedAt) }),
    [post],
  );

  // The generated document gets exactly one allowance for its own URL. It is
  // consumed the moment that request is accepted (iOS routes the initial
  // load through here) or when the document starts loading (Android does
  // not) — not at onLoadEnd, which remote images can hold open while a
  // preview link to the publication root is already tappable.
  const documentClaimedRef = useRef(false);
  const handleLoadRequest = useCallback((request: LoadRequest): boolean => {
    if (shouldAllowDocumentLoad(request.url, documentClaimedRef.current)) {
      documentClaimedRef.current = true;
      return true;
    }
    void openInBrowser(request.url, "newsletter_post");
    return false;
  }, []);
  const handleLoadStart = useCallback(() => {
    documentClaimedRef.current = true;
  }, []);

  // The post URL (not /subscribe) so the browser lands on this issue's
  // paywall, where Substack runs its own subscribe flow.
  const subscribe = () => {
    captureEvent("newsletter_subscribe_tapped", { context: "newsletter_post" });
    void openInBrowser(post.link, "newsletter_post");
  };

  return (
    <View style={styles.flex}>
      <WebView
        allowsLinkPreview={false}
        incognito
        javaScriptEnabled={false}
        onLoadStart={handleLoadStart}
        onShouldStartLoadWithRequest={handleLoadRequest}
        originWhitelist={ORIGIN_WHITELIST}
        setSupportMultipleWindows={false}
        source={{ html, baseUrl: NEWSLETTER_BASE_URL }}
        style={styles.webview}
      />
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, space.md) },
        ]}
      >
        <Text style={styles.footerText}>Subscribe to read the full issue</Text>
        <Button label="Subscribe" tone="primary" onPress={subscribe} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: color.oreo,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  actions: {
    gap: space.md,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
  },
  webview: {
    backgroundColor: color.oreo,
    flex: 1,
  },
  footer: {
    alignItems: "center",
    backgroundColor: color.darkChocolate,
    borderTopColor: color.oreo,
    borderTopWidth: 2,
    flexDirection: "row",
    gap: space.md,
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  footerText: {
    ...typePreset.bodyBold14,
    color: color.white,
    flex: 1,
  },
});
