// Presence pass, timestamp-normalised change detection, observation-ordered
// event writes, and sync_runs bookkeeping added for event sync. Baseline
// reconcile behaviour lives in refresh_tick_test.ts.
import { createRefreshHandler } from "../refresh-tick/index.ts";
import { changed, planPresence, PRESENCE_GUARD_MIN } from "../_shared/reconcile.ts";
import { noopSyncRuns, runRefresh, type RefreshDeps, type SyncRunsStore } from "../_shared/refresh.ts";
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
      ({ insertedIds: rows.map((row) => row.webflow_item_id), updated: 0, stale: 0, pendingMarked: pendingIds.size }),
    fetchItem: async (_token, _collectionId, itemId) => eventItem(itemId),
    replaceAllEventOrganizers: async (rows) => ({ inserted: rows.length }),
    loadEventIdsObservedAfter: async () => [],
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

// The row write knows when it lost to a newer observation; the full
// organizer replacement must not undo that event's newer relationships.
Deno.test("organizer replacement leaves alone events a webhook observed after the run started", async () => {
  const replacements: { rows: readonly unknown[]; keep: readonly string[] }[] = [];
  const handler = createRefreshHandler(refreshDeps({
    fetchItems: async (_token, collectionId) => {
      if (collectionId === ORGANIZERS) return [organizerItem];
      if (collectionId === EVENTS) return [eventWithOrganizer("newer"), eventWithOrganizer("untouched")];
      return [];
    },
    loadEventIdsObservedAfter: async (observedAt) => (observedAt === NOW ? ["newer"] : []),
    replaceAllEventOrganizers: async (rows, keepEventIds) => {
      replacements.push({ rows, keep: keepEventIds });
      return { inserted: rows.length };
    }
  }));

  const summary = await (await handler(refreshRequest())).json();

  assertEquals(replacements, [{ rows: [{ event_id: "untouched", organizer_id: "org-1" }], keep: ["newer"] }]);
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
  assertEquals(plan, { toHide: ["gone"], toRevive: ["back"], skipped: false });
});

Deno.test("planPresence skips everything on an empty live set", () => {
  const plan = planPresence([existingEvent("a"), existingEvent("b")], new Set());
  assertEquals(plan.skipped, true);
  assertEquals(plan.toHide, []);
  assertEquals(plan.toRevive, []);
});

Deno.test("planPresence refuses to hide more than the guard but still revives", () => {
  const existing = [
    ...Array.from({ length: PRESENCE_GUARD_MIN + 1 }, (_, i) => existingEvent(`gone-${i}`)),
    existingEvent("back", false)
  ];
  const plan = planPresence(existing, new Set(["back", "unrelated-live"]));
  assertEquals(plan.skipped, true);
  assertEquals(plan.toHide, []);
  assertEquals(plan.toRevive, ["back"]);
  assertEquals(plan.reason?.startsWith("hide count"), true);
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
  assertEquals(summary.presence, { hidden: 1, revived: 1, skipped: false });
});

Deno.test("refresh takes its observation time once, before any Webflow fetch, and hands it to every event write", async () => {
  let clock = 0;
  let clockAtFirstFetch = -1;
  const observedAts: string[] = [];
  const handler = createRefreshHandler(refreshDeps({
    now: () => (clock++ === 0 ? NOW : LATER),
    loadExisting: async (table) => (table === "events" ? [existingEvent("stale-row", false)] : []),
    fetchItems: async (_token, collectionId) => {
      if (clockAtFirstFetch < 0) clockAtFirstFetch = clock;
      return collectionId === EVENTS ? [eventItem("new-row"), eventItem("stale-row", "2026-06-02T00:00:00.000Z")] : [];
    },
    applyEventRows: async (rows, observedAt, pendingIds) => {
      observedAts.push(observedAt);
      return { insertedIds: rows.map((row) => row.webflow_item_id), updated: 0, stale: 0, pendingMarked: pendingIds.size };
    },
    setEventsLive: async (ids, _isLive, observedAt) => {
      observedAts.push(observedAt);
      return { updated: ids.length };
    }
  }));

  await handler(refreshRequest());

  assertEquals(clockAtFirstFetch, 1);
  assertEquals(observedAts, [NOW, NOW]);
});

Deno.test("refresh reports event writes that lost to a newer observation instead of forcing them", async () => {
  const handler = createRefreshHandler(refreshDeps({
    loadExisting: async (table) => (table === "events" ? [existingEvent("edited"), existingEvent("raced")] : []),
    fetchItems: async (_token, collectionId) =>
      collectionId === EVENTS
        ? [eventItem("edited", "2026-06-02T00:00:00.000Z"), eventItem("raced", "2026-06-02T00:00:00.000Z"), eventItem("brand-new")]
        : [],
    applyEventRows: async (rows) => ({ insertedIds: ["brand-new"], updated: rows.length - 2, stale: 1, pendingMarked: 0 })
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
    applyEventRows: async () => ({ insertedIds: ["fresh", "kept"], updated: 0, stale: 0, pendingMarked: 0 }),
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

Deno.test("refresh reports a skipped presence pass instead of blanking the app on an empty live set", async () => {
  const liveCalls: unknown[] = [];
  const handler = createRefreshHandler(refreshDeps({
    loadExisting: async (table) => (table === "events" ? [existingEvent("a"), existingEvent("b")] : []),
    setEventsLive: async (ids, isLive) => {
      liveCalls.push({ ids, isLive });
      return { updated: ids.length };
    }
  }));

  const summary = await (await handler(refreshRequest())).json();

  assertEquals(liveCalls, []);
  assertEquals(summary.presence, { hidden: 0, revived: 0, skipped: true, reason: "empty live set" });
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
  assertEquals(summary.presence.skipped, true);
  assertEquals(summary.eventWrites, { inserted: 0, updated: 0, stale: 0, hiddenAfterInsert: 0 });
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
