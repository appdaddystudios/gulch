import { constantTimeEqual, jsonResponse } from "../_shared/auth.ts";
import { runRefresh, type RefreshDeps } from "../_shared/refresh.ts";

export type { RefreshDeps };

// Scheduled (pg_cron) and manual full reconcile. The work lives in
// _shared/refresh.ts so the site_publish webhook runs the identical pass.
export function createRefreshHandler(deps: RefreshDeps = {}): (request: Request) => Promise<Response> {
  const env = deps.env ?? Deno.env.get;

  return async (request: Request): Promise<Response> => {
    const refreshSecret = env("GULCH_REFRESH_SECRET");
    const authorization = request.headers.get("authorization") ?? "";
    if (!refreshSecret || !constantTimeEqual(`Bearer ${refreshSecret}`, authorization)) {
      return jsonResponse({ ok: false }, 401);
    }

    const source = new URL(request.url).searchParams.get("source") === "manual" ? "manual" : "cron";
    const summary = await runRefresh(deps, source);
    return jsonResponse(summary);
  };
}

if (import.meta.main) {
  Deno.serve(createRefreshHandler());
}
