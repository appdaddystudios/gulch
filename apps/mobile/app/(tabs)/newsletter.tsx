import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Header } from "../../components/Header";
import { NewsletterIcon } from "../../components/icons";
import { NewsletterPostCard } from "../../components/NewsletterPostCard";
import { NewsletterPublicationCard } from "../../components/NewsletterPublicationCard";
import {
  useNewsletterFeed,
  type UseNewsletterFeedResult,
} from "../../hooks/useNewsletterFeed";
import {
  NEWSLETTER_SUBSCRIBE_URL,
  type NewsletterPost,
} from "../../lib/newsletterFeed";
import { openInBrowser } from "../../lib/openLink";
import { captureEvent } from "../../lib/telemetry";
import { color, space } from "../../theme";

const keyExtractor = (post: NewsletterPost): string => post.slug;

// Native newsletter: issues come from Substack's RSS feed and render in-app;
// no third-party page (or its cookie banner) ever loads here — App Review
// 5.1.2(i) rejected the previous WebView embed.
export default function NewsletterScreen() {
  const feedResult = useNewsletterFeed();

  useEffect(() => {
    captureEvent("newsletter_viewed");
  }, []);

  return (
    <View style={styles.screen}>
      <Header />
      <Content {...feedResult} />
    </View>
  );
}

function Content({
  status,
  feed,
  refreshing,
  reload,
  refresh,
}: UseNewsletterFeedResult) {
  const router = useRouter();

  const openPost = useCallback(
    (post: NewsletterPost) => {
      captureEvent("newsletter_post_opened", { slug: post.slug });
      router.push(`/newsletter/${post.slug}`);
    },
    [router],
  );

  const subscribe = useCallback(() => {
    captureEvent("newsletter_subscribe_tapped", { context: "newsletter_list" });
    void openInBrowser(NEWSLETTER_SUBSCRIBE_URL, "newsletter_list");
  }, []);

  const renderItem = useCallback(
    ({ item }: { readonly item: NewsletterPost }) => (
      <NewsletterPostCard post={item} onPress={() => openPost(item)} />
    ),
    [openPost],
  );

  if (status === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.gulchGreen} size="large" />
      </View>
    );
  }

  if (status === "error" || !feed) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon={<NewsletterIcon size={48} color={color.gulchGreen} />}
          title="Newsletter"
          subtitle="Couldn't load the newsletter. Check your connection and try again."
          action={
            <Button label="Try Again" size="s" tone="primary" onPress={reload} />
          }
        />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={feed.posts}
      keyExtractor={keyExtractor}
      ListEmptyComponent={
        <EmptyState
          icon={<NewsletterIcon size={48} color={color.gulchGreen} />}
          title="No issues yet"
          subtitle="New issues will show up here as they're published."
        />
      }
      ListHeaderComponent={
        <NewsletterPublicationCard
          publication={feed.publication}
          onSubscribe={subscribe}
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={color.gulchGreen}
        />
      }
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: color.darkChocolate,
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
  },
  list: {
    gap: space.xl,
    paddingBottom: space.huge,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
  },
});
