import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchNewsletterFeed,
  isNewsletterFeedFresh,
  parseCachedNewsletterFeed,
  type NewsletterFeed,
  type NewsletterPost,
} from "../lib/newsletterFeed";
import { captureException } from "../lib/telemetry";

const CACHE_KEY = "gulch.newsletterFeed.v1";

export type NewsletterFeedStatus = "loading" | "ready" | "error";

export type NewsletterFeedState = {
  readonly status: NewsletterFeedStatus;
  readonly feed: NewsletterFeed | null;
  readonly refreshing: boolean;
};

export type UseNewsletterFeedResult = NewsletterFeedState & {
  // Hard reload: back to `loading`, then cache → network again.
  readonly reload: () => void;
  // Pull-to-refresh: always fetches, keeps the current list on failure.
  readonly refresh: () => void;
};

export type NewsletterPostState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly post: NewsletterPost | null }
  | { readonly status: "error" };

const INITIAL_FEED_STATE: NewsletterFeedState = {
  status: "loading",
  feed: null,
  refreshing: false,
};

// Process-lifetime copy so the post screen resolves a slug without touching
// storage; storage backs it across launches, the network fills a cold start.
let memoryFeed: NewsletterFeed | null = null;

const readStoredFeed = async (): Promise<NewsletterFeed | null> => {
  if (memoryFeed) {
    return memoryFeed;
  }
  try {
    const stored = parseCachedNewsletterFeed(
      await AsyncStorage.getItem(CACHE_KEY),
    );
    if (stored) {
      memoryFeed = stored;
    }
    return stored;
  } catch (error) {
    captureException(error);
    return null;
  }
};

// One network request at a time. An overlapping stale-cache revalidation
// and pull-to-refresh share the same promise, so an older response can never
// finish last and overwrite a newer feed (and its fetchedAt) in the cache.
let inFlight: Promise<NewsletterFeed> | null = null;

const fetchAndStore = (): Promise<NewsletterFeed> => {
  if (inFlight) {
    return inFlight;
  }
  const request = fetchNewsletterFeed()
    .then((feed) => {
      memoryFeed = feed;
      // Best-effort persistence — a failed write must not fail the screen.
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(feed)).catch(
        captureException,
      );
      return feed;
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = request;
  return request;
};

const readyState = (feed: NewsletterFeed): NewsletterFeedState => ({
  status: "ready",
  feed,
  refreshing: false,
});

const ERROR_FEED_STATE: NewsletterFeedState = {
  status: "error",
  feed: null,
  refreshing: false,
};

export function useNewsletterFeed(): UseNewsletterFeedResult {
  const [state, setState] = useState<NewsletterFeedState>(INITIAL_FEED_STATE);
  const [attempt, setAttempt] = useState(0);
  // Whichever request started last owns the result (same scheme as useQuery).
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;
    const isCurrent = () => token === tokenRef.current;

    const load = async () => {
      const cached = await readStoredFeed();
      if (!isCurrent()) {
        return;
      }
      if (cached) {
        setState(readyState(cached));
        if (isNewsletterFeedFresh(cached)) {
          return;
        }
      }
      try {
        const fresh = await fetchAndStore();
        if (isCurrent()) {
          setState(readyState(fresh));
        }
      } catch (error) {
        captureException(error);
        // With a cached list on screen the failure stays silent
        // (stale-while-revalidate); with nothing to show it surfaces.
        if (isCurrent() && !cached) {
          setState(ERROR_FEED_STATE);
        }
      }
    };
    void load();

    return () => {
      tokenRef.current += 1;
    };
  }, [attempt]);

  // Silent revalidation: the current list stays on screen, a failure is
  // only reported. Owns the result like any other request.
  const revalidate = useCallback(() => {
    const token = ++tokenRef.current;
    fetchAndStore()
      .then((fresh) => {
        if (token === tokenRef.current) {
          setState(readyState(fresh));
        }
      })
      .catch(captureException);
  }, []);

  // The tab navigator keeps this screen mounted, so the mount effect alone
  // never re-checks freshness. Re-check whenever the tab regains focus; the
  // ref is synced in an effect so the focus callback needs no state dep.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useFocusEffect(
    useCallback(() => {
      const current = stateRef.current;
      const idleWithFeed =
        current.status === "ready" && current.feed && !current.refreshing;
      if (idleWithFeed && !isNewsletterFeedFresh(current.feed)) {
        revalidate();
      }
    }, [revalidate]),
  );

  const reload = useCallback(() => {
    setState(INITIAL_FEED_STATE);
    setAttempt((count) => count + 1);
  }, []);

  const refresh = useCallback(() => {
    const token = ++tokenRef.current;
    const isCurrent = () => token === tokenRef.current;
    setState((prev) => ({ ...prev, refreshing: true }));

    fetchAndStore()
      .then((fresh) => {
        if (isCurrent()) {
          setState(readyState(fresh));
        }
      })
      .catch((error: unknown) => {
        captureException(error);
        if (isCurrent()) {
          setState((prev) =>
            prev.feed ? { ...prev, refreshing: false } : ERROR_FEED_STATE,
          );
        }
      });
  }, []);

  return { ...state, reload, refresh };
}

const findPost = (
  feed: NewsletterFeed | null,
  slug: string,
): NewsletterPost | null =>
  feed?.posts.find((post) => post.slug === slug) ?? null;

// Resolves one issue: memory → storage → network. A null slug (malformed deep
// link) resolves to "missing" without any I/O.
export function useNewsletterPost(slug: string | null): NewsletterPostState {
  const [state, setState] = useState<NewsletterPostState>(() =>
    slug ? { status: "loading" } : { status: "ready", post: null },
  );

  useEffect(() => {
    if (!slug) {
      return;
    }
    let cancelled = false;

    const resolve = async () => {
      const cached = await readStoredFeed();
      const hit = findPost(cached, slug);
      if (cancelled) {
        return;
      }
      if (hit) {
        setState({ status: "ready", post: hit });
        return;
      }
      try {
        const fresh = await fetchAndStore();
        if (!cancelled) {
          setState({ status: "ready", post: findPost(fresh, slug) });
        }
      } catch (error) {
        captureException(error);
        if (!cancelled) {
          setState(cached ? { status: "ready", post: null } : { status: "error" });
        }
      }
    };
    void resolve();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
