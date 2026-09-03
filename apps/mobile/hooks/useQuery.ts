import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createMobileSupabase } from "../lib/supabase";

import type { DbClient } from "@gulch/db";

export type QueryState<T> =
  | { readonly status: "missing-client" }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: T };

export type UseQueryOptions = {
  // While false the loader is not invoked and the state stays `loading`;
  // the first real run happens when this flips to true. Default true.
  readonly enabled?: boolean;
};

export type UseQueryResult<T> = {
  readonly state: QueryState<T>;
  // Hard reload: enters `loading`, so consumers show their pending UI.
  readonly reload: () => void;
  // Silent reload: keeps the current data on screen, swaps it on success and
  // leaves it untouched on failure (pull-to-refresh).
  readonly refresh: () => void;
  readonly refreshing: boolean;
};

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong.";

// Memoized anon Supabase client (null when env is not configured).
export const useDbClient = (): DbClient | null =>
  useMemo(() => createMobileSupabase(), []);

// Runs `loader(client)` whenever the client changes and exposes a `reload`.
export function useQuery<T>(
  client: DbClient | null,
  loader: (client: DbClient) => Promise<T>,
  { enabled = true }: UseQueryOptions = {},
): UseQueryResult<T> {
  const [state, setState] = useState<QueryState<T>>(
    client ? { status: "loading" } : { status: "missing-client" },
  );
  const [refreshing, setRefreshing] = useState(false);
  // One token for both `run` and `refresh`: whichever request started last
  // owns the result, so a reload during a refresh wins and unmount drops
  // whatever is still in flight.
  const tokenRef = useRef(0);

  const run = useCallback(() => {
    if (!client) {
      setState({ status: "missing-client" });
      return;
    }

    const token = ++tokenRef.current;
    setRefreshing(false);
    setState({ status: "loading" });
    if (!enabled) {
      return;
    }

    loader(client)
      .then((data) => {
        if (token === tokenRef.current) {
          setState({ status: "ready", data });
        }
      })
      .catch((error: unknown) => {
        if (token === tokenRef.current) {
          setState({ status: "error", message: toMessage(error) });
        }
      });

    return () => {
      tokenRef.current += 1;
    };
    // loader identity is owned by the caller (wrap in useCallback there).
  }, [client, enabled, loader]);

  const refresh = useCallback(() => {
    if (!client || !enabled) {
      return;
    }

    const token = ++tokenRef.current;
    setRefreshing(true);

    loader(client)
      .then((data) => {
        if (token === tokenRef.current) {
          setState({ status: "ready", data });
        }
      })
      .catch((error: unknown) => {
        // Nothing to keep visible if the initial load never landed (this
        // refresh superseded it), so surface the failure instead of hanging.
        if (token === tokenRef.current) {
          setState((prev) =>
            prev.status === "loading"
              ? { status: "error", message: toMessage(error) }
              : prev,
          );
        }
      })
      .finally(() => {
        if (token === tokenRef.current) {
          setRefreshing(false);
        }
      });
  }, [client, enabled, loader]);

  useEffect(() => run(), [run]);

  return { state, reload: run, refresh, refreshing };
}
