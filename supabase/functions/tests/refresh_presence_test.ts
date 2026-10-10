// Presence pass, timestamp-normalised change detection, observation-ordered
// event writes, and sync_runs bookkeeping added for event sync. Baseline
// reconcile behaviour lives in refresh_tick_test.ts.
import { createRefreshHandler } from "../refresh-tick/index.ts";
import { changed, planPresence, PRESENCE_GUARD_MIN } from "../_shared/reconcile.ts";
import { HERO_FETCH_CAP, noopSyncRuns, runRefresh, type RefreshDeps, type SyncRunsStore } from "../_shared/refresh.ts";
import type { ExistingRow } from "../_shared/db.ts";
import type { WebflowItem } from "../_shared/schemas.ts";
import { assertEquals, envelope } from "./helpers.ts";

const EVENTS = "6845d39c294d60e4c197cee9";
const NOW = "2026-10-10T12:00:00.000Z";
const LATER = "2026-10-10T12:00:05.000Z";

const eventItem = (id: string, lastUpdated = "2026-06-01T00:00:00.000Z"): WebflowItem => ({
  ...envelope,
  id,
  lastUpdated,
  fieldData: { name: id, slug: id, "start-date-time": "2026-07-01T00:00:00.000Z" }
});

const existingEvent = (id: string, isLive: boolean | undefined = true): ExistingRow => ({
  webflow_item_id: id,
  webflow_last_updated: "2026-06-01T00:00:00.000Z",
  ...(isLive === undefined ? {} : { is_live: isLive })
});

function refreshDeps(overrides: RefreshDeps = {}): RefreshDeps {
  return {
    syncRuns: noopSyncRuns,
    env: (key) => ({ GULCH_REFRESH_SECRET: "right", GULCH_WEBFLOW_API_KEY: "webflow", MAPBOX_TOKEN: "mapbox" })[key],
    loadExisting: async () => [],
    fetchItems: async () => [],
    geocoder: async () => ({ latitude: null, longitude: null, status: "pending" }),
    upsert: async () => {},
    applyEventRows: async (rows, _observedAt, pendingIds) =>
      ({ insertedIds: rows.map((row) => row.webflow_item_id), updated: 0, stale: 0, pendingMarkedIds: [...pendingIds] }),
    fetchItem: async (_token, _collectionId, itemId) => eventItem(itemId),
    fetchHeroImage: async () => "ok",
    replaceAllEventOrganizers: async (rows) => ({ inserted: rows.length }),
    updateManagingOrganizerRefs: async (updates) => ({ updated: updates.length }),
    setEventsLive: async (ids) => ({ updated: ids.length }),
    now: () => NOW,
    ...overrides
  };
}

const ORGANIZERS = "6a430e64b51f80db57a22b3c";
const organizerItem: WebflowItem = {
  ...envelope,
  id: "org-1",
  lastUpdated: "2026-06-01T00:00:00.000Z",
  fieldData: { name: "Org", slug: "org" }
};
const eventWithOrganizer = (id: string): WebflowItem => ({
  ...eventItem(id),
  fieldData: { ...eventItem(id).fieldData, "additional-organizers": ["org-1"] }
});

// The full organizer replacement runs inside the database with the run's
// observation time; events a webhook observed later are excluded there, in
// the same transaction as the clear and the insert (migration 0014).
Deno.test("full organizer replacement is handed every live relationship with the run's observation time", async () => {
  const replacements: { rows: readonly unknown[]; observedAt: string }[] = [];
  const handler = createRefreshHandler(refreshDeps({
    fetchItems: async (_token, collectionId) => {
      if (collectionId === ORGANIZERS) return [organizerItem];
      if (collectionId === EVENTS) return [eventWithOrganizer("newer"), eventWithOrganizer("untouched")];
      return [];
    },
    replaceAllEventOrganizers: async (rows, observedAt) => {
      replacements.push({ rows, observedAt });
      return { inserted: 1 };
    }
  }));

  const summary = await (await handler(refreshRequest())).json();

  assertEquals(replacements, [{
    rows: [{ event_id: "newer", organizer_id: "org-1" }, { event_id: "untouched", organizer_id: "org-1" }],
    observedAt: NOW
  }]);
  assertEquals(summary.eventOrganizers.replaced, 1);
});

const refreshRequest = () => new Request("https://example.test", { method: "POST", headers: { authorization: "Bearer right" } });

Deno.test("changed() treats PostgREST +00:00 and Webflow Z as the same instant", () => {
  const existing = new Map([["e1", "2026-10-10T05:19:00.607+00:00"]]);
  assertEquals(changed(eventItem("e1", "2026-10-10T05:19:00.607Z"), existing), false);
  assertEquals(changed(eventItem("e1", "2026-10-10T05:19:01.000Z"), existing), true);
  assertEquals(changed(eventItem("new"), existing), true);
});

Deno.test("planPresence hides absent rows, revives present ones, and leaves rows without the flag alone when live", () => {
  const existing = [existingEvent("keep"), existingEvent("gone"), existingEvent("back", false), existingEvent("legacy", undefined)];
  const plan = planPresence(existing, new Set(["keep", "back", "legacy"]));
  assertEquals(plan, { toHide: ["gone"], toRevive: ["back"], deferred: 0, skipped: false });
});

// An empty live set is a snapshot like any other: one guarded batch per run.
// If it is a Webflow anomaly the next good run revives the batch; if it is
// real, repeated runs converge instead of leaving rows visible forever.
Deno.test("planPresence treats an empty live set as one guarded batch with the rest deferred", () => {
  const existing = Array.from({ length: PRESENCE_GUARD_MIN + 3 }, (_, i) => existingEvent(`row-${i}`));
  const plan = planPresence(existing, new Set());

  assertEquals(plan.skipped, false);
  assertEquals(plan.toHide.length, PRESENCE_GUARD_MIN);
  assertEquals(plan.deferred, 3);
  assertEquals(plan.toRevive, []);
});

// A bad snapshot can only hide one guarded batch, and revives are unguarded
// so the next good run undoes it. A legitimately large hide set converges
// over runs instead of being skipped forever.
Deno.test("planPresence hides at most the guard per run, defers the rest, and still revives", () => {
  const gone = Array.from({ length: PRESENCE_GUARD_MIN + 1 }, (_, i) => existingEvent(`gone-${i}`));
  const plan = planPresence([...gone, existingEvent("back", false)], new Set(["back", "unrelated-live"]));

  assertEquals(plan.skipped, false);
  assertEquals(plan.toHide, gone.slice(0, PRESENCE_GUARD_MIN).map((row) => row.webflow_item_id));
  assertEquals(plan.deferred, 1);
  assertEquals(plan.toRevive, ["back"]);
});

// Hide and revive carry the run's observation time so a webhook received
// after this run started (a newer observation) is never undone by it.
Deno.test("refresh hides events missing from Webflow and revives republished ones, stamped with the run's observation time", async () => {
  const liveCalls: { ids: readonly string[]; isLive: boolean; observedAt: string }[] = [];
  const handler = createRefreshHandler(refreshDeps({
    loadExisting: async (table) =>
      table === "events" ? [existingEvent("keep"), existingEvent("cancelled"), existingEvent("republished", false)] : [],
    fetchItems: async (_token, collectionId) =>
      collectionId === EVENTS ? [eventItem("keep"), eventItem("republished")] : [],
    setEventsLive: async (ids, isLive, observedAt) => {
      liveCalls.push({ ids, isLive, observedAt });
      return { updated: ids.length };
    }
  }));

  const summary = await (await handler(refreshRequest())).json();

  assertEquals(liveCalls, [
    { ids: ["cancelled"], isLive: false, observedAt: NOW },
    { ids: ["republished"], isLive: true, observedAt: NOW }
  ]);
  assertEquals(summary.presence, { hidden: 1, revived: 1, deferred: 0, skipped: false });
});

Deno.test("refresh hides only the guarded batch per run and reports the deferred remainder", async () => {
  const liveCalls: { ids: readonly string[]; isLive: boolean }[] = [];
  const stale = Array.from({ length: PRESENCE_GUARD_MIN + 5 }, (_, i) => existingEvent(`stale-${i}`));
  const handler = createRefreshHandler(refreshDeps({
    loadExisting: async (table) => (table === "events" ? stale : []),
    fetchItems: async (_token, collectionId) => (collectionId === EVENTS ? [eventItem("only-live")] : []),
    setEventsLive: async (ids, isLive) => {
      liveCalls.push({ ids, isLive });
      return { updated: ids.length };
    }
  }));

  const summary = await (await handler(refreshRequest())).json();

  assertEquals(liveCalls.length, 1);
  assertEquals(liveCalls[0]?.ids.length, PRESENCE_GUARD_MIN);
  assertEquals(liveCalls[0]?.isLive, false);
  assertEquals(summary.presence, { hidden: PRESENCE_GUARD_MIN, revived: 0, deferred: 5, skipped: false });
});

// The stamp is taken immediately before the events fetch, after the other
// collections are loaded and fetched: earlier would be safe but needlessly
// old, and a fresher reconcile observation would lose to a webhook write
// that landed during those loads.
Deno.test("refresh stamps its observation immediately before the events fetch and hands it to every event write", async () => {
  let clock = 0;
  const clockAtFetch: Record<string, number> = {};
  const observedAts: string[] = [];
  const handler = createRefreshHandler(refreshDeps({
    now: () => (clock++ === 0 ? NOW : LATER),
    loadExisting: async (table) => (table === "events" ? [existingEvent("stale-row", false)] : []),
    fetchItems: async (_token, collectionId) => {
      clockAtFetch[collectionId] = clock;
      return collectionId === EVENTS ? [eventItem("new-row"), eventItem("stale-row", "2026-06-02T00:00:00.000Z")] : [];
    },
    applyEventRows: async (rows, observedAt, pendingIds) => {
      observedAts.push(observedAt);
      return { insertedIds: rows.map((row) => row.webflow_item_id), updated: 0, stale: 0, pendingMarkedIds: [...pendingIds] };
    },
    setEventsLive: async (ids, _isLive, observedAt) => {
      observedAts.push(observedAt);
      return { updated: ids.length };
    }
  }));

  await handler(refreshRequest());

  assertEquals(clockAtFetch[ORGANIZERS], 0);
  assertEquals(clockAtFetch[EVENTS], 1);
  assertEquals(observedAts, [NOW, NOW]);
});

Deno.test("refresh reports event writes that lost to a newer observation instead of forcing them", async () => {
  const handler = createRefreshHandler(refreshDeps({
    loadExisting: async (table) => (table === "events" ? [existingEvent("edited"), existingEvent("raced")] : []),
    fetchItems: async (_token, collectionId) =>
      collectionId === EVENTS
        ? [eventItem("edited", "2026-06-02T00:00:00.000Z"), eventItem("raced", "2026-06-02T00:00:00.000Z"), eventItem("brand-new")]
        : [],
    applyEventRows: async (rows) => ({ insertedIds: ["brand-new"], updated: rows.length - 2, stale: 1, pendingMarkedIds: [] })
  }));

  const summary = await (await handler(refreshRequest())).json();

  assertEquals(summary.eventWrites, { inserted: 1, updated: 1, stale: 1, hiddenAfterInsert: 0 });
  assertEquals(summary.events.upserted, 3);
});

// Same gap as the webhook insert: a row the run inserts carried no
// observation an earlier unpublish could have beaten. Re-read each inserted
// item once with a fresh observation and hide it if it is already gone.
Deno.test("refresh re-reads the events it inserted and hides those unpublished meanwhile", async () => {
  let clock = 0;
  const liveCalls: { ids: readonly string[]; isLive: boolean; observedAt: string }[] = [];
  const reads: string[] = [];
  const handler = createRefreshHandler(refreshDeps({
    now: () => (clock++ === 0 ? NOW : LATER),
    fetchItems: async (_token, collectionId) => (collectionId === EVENTS ? [eventItem("fresh"), eventItem("kept")] : []),
    applyEventRows: async () => ({ insertedIds: ["fresh", "kept"], updated: 0, stale: 0, pendingMarkedIds: [] }),
    fetchItem: async (_token, _collectionId, itemId) => {
      reads.push(itemId);
      return itemId === "fresh" ? null : eventItem(itemId);
    },
    setEventsLive: async (ids, isLive, observedAt) => {
      liveCalls.push({ ids, isLive, observedAt });
      return { updated: ids.length };
    }
  }));

  const summary = await (await handler(refreshRequest())).json();

  assertEquals(reads, ["fresh", "kept"]);
  assertEquals(liveCalls, [{ ids: ["fresh"], isLive: false, observedAt: LATER }]);
  assertEquals(summary.eventWrites, { inserted: 2, updated: 0, stale: 0, hiddenAfterInsert: 1 });
});

// A link change the reconcile marks pending must not wait for the image
// drain: the refresh fetches the hero itself, as the webhook path does,
// capped per run so a bulk change cannot stall the function.
Deno.test("refresh fetches the hero image for link-changed rows it marked pending, capped per run", async () => {
  const fetched: { id: string; link: string | null }[] = [];
  const count = HERO_FETCH_CAP + 1;
  const ids = Array.from({ length: count }, (_, i) => `linked-${i}`);
  const withLink = (id: string): WebflowItem => ({
    ...eventItem(id, "2026-06-02T00:00:00.000Z"),
    fieldData: { ...eventItem(id).fieldData, "external-link": `https://www.instagram.com/p/${id}/` }
  });
  const handler = createRefreshHandler(refreshDeps({
    loadExisting: async (table) =>
      table === "events" ? ids.map((id) => ({ ...existingEvent(id), external_link: "https://www.instagram.com/p/old/" })) : [],
    fetchItems: async (_token, collectionId) => (collectionId === EVENTS ? ids.map(withLink) : []),
    applyEventRows: async (rows, _observedAt, pendingIds) =>
      ({ insertedIds: [], updated: rows.length, stale: 0, pendingMarkedIds: [...pendingIds] }),
    fetchHeroImage: async (id, link) => {
      fetched.push({ id, link });
      return "ok";
    }
  }));

  const summary = await (await handler(refreshRequest())).json();

  assertEquals(fetched.length, HERO_FETCH_CAP);
  assertEquals(fetched[0], { id: "linked-0", link: "https://www.instagram.com/p/linked-0/" });
  assertEquals(summary.imagePending, { marked: count, fetched: HERO_FETCH_CAP });
});

Deno.test("refresh hides one guarded batch on an empty live set instead of skipping it forever", async () => {
  const liveCalls: { ids: readonly string[]; isLive: boolean }[] = [];
  const handler = createRefreshHandler(refreshDeps({
    loadExisting: async (table) => (table === "events" ? [existingEvent("a"), existingEvent("b")] : []),
    setEventsLive: async (ids, isLive) => {
      liveCalls.push({ ids, isLive });
      return { updated: ids.length };
    }
  }));

  const summary = await (await handler(refreshRequest())).json();

  assertEquals(liveCalls, [{ ids: ["a", "b"], isLive: false }]);
  assertEquals(summary.presence, { hidden: 2, revived: 0, deferred: 0, skipped: false });
});

Deno.test("runRefresh records a sync run start and a successful finish with the summary", async () => {
  const calls: unknown[] = [];
  const syncRuns: SyncRunsStore = {
    start: async (source) => {
      calls.push({ start: source });
      return 7;
    },
    finish: async (id, result) => {
      calls.push({ finish: id, ok: result.ok });
    }
  };

  const summary = await runRefresh(refreshDeps({ syncRuns }), "manual");

  assertEquals(calls, [{ start: "manual" }, { finish: 7, ok: true }]);
  assertEquals(summary.presence, { hidden: 0, revived: 0, deferred: 0, skipped: false });
  assertEquals(summary.eventWrites, { inserted: 0, updated: 0, stale: 0, hiddenAfterInsert: 0 });
});

Deno.test("runRefresh finishes an already-claimed run instead of starting a second one", async () => {
  const calls: unknown[] = [];
  const syncRuns: SyncRunsStore = {
    start: async (source) => {
      calls.push({ start: source });
      return 9;
    },
    finish: async (id, result) => {
      calls.push({ finish: id, ok: result.ok });
    }
  };

  await runRefresh(refreshDeps({ syncRuns }), "site_publish", 42);

  assertEquals(calls, [{ finish: 42, ok: true }]);
});

Deno.test("runRefresh records a failed finish with the error and rethrows", async () => {
  const calls: unknown[] = [];
  const syncRuns: SyncRunsStore = {
    start: async () => 8,
    finish: async (id, result) => {
      calls.push({ finish: id, ok: result.ok, error: result.ok ? undefined : result.error });
    }
  };

  let thrown: string | null = null;
  try {
    await runRefresh(refreshDeps({ syncRuns, fetchItems: async () => { throw new Error("webflow down"); } }), "cron");
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  }

  assertEquals(thrown, "webflow down");
  assertEquals(calls, [{ finish: 8, ok: false, error: "webflow down" }]);
});

Deno.test("refresh-tick reports source=manual when asked and cron otherwise", async () => {
  const sources: string[] = [];
  const syncRuns: SyncRunsStore = {
    start: async (source) => {
      sources.push(source);
      return null;
    },
    finish: async () => {}
  };
  const handler = createRefreshHandler(refreshDeps({ syncRuns }));

  await handler(new Request("https://example.test?source=manual", { method: "POST", headers: { authorization: "Bearer right" } }));
  await handler(refreshRequest());

  assertEquals(sources, ["manual", "cron"]);
});
