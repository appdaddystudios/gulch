import { useCallback, useEffect, useMemo, useState } from "react";

import { createMobileSupabase } from "../lib/supabase";

import type { DbClient } from "@gulch/db";

export type QueryState<T> =
  | { readonly status: "missing-client" }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: T };

// Memoized anon Supabase client (null when env is not configured).
export const useDbClient = (): DbClient | null =>
  useMemo(() => createMobileSupabase(), []);

// Runs `loader(client)` whenever the client changes and exposes a `reload`.
export function useQuery<T>(
  client: DbClient | null,
  loader: (client: DbClient) => Promise<T>,
): { readonly state: QueryState<T>; readonly reload: () => void } {
  const [state, setState] = useState<QueryState<T>>(
    client ? { status: "loading" } : { status: "missing-client" },
  );

  const run = useCallback(() => {
    if (!client) {
      setState({ status: "missing-client" });
      return;
    }

    setState({ status: "loading" });
    let cancelled = false;

    loader(client)
      .then((data) => {
        if (!cancelled) {
          setState({ status: "ready", data });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Something went wrong.";
          setState({ status: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
    // loader identity is owned by the caller (wrap in useCallback there).
  }, [client, loader]);

  useEffect(() => run(), [run]);

  return { state, reload: run };
}
