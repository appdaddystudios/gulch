// Trigger dispatch added for event sync: published / unpublished / deleted /
// site_publish / changed, plus the immediate hero-image kick-off. The
// original collection_item_created behaviour is covered by webhook_test.ts.
//
// Every Webflow-state write to events is ordered by observation time (see
// applyEventRows in _shared/db.ts); these tests pin what the handler hands
// that write and what it must not do when its observation lost.
import { createWebhookHandler, SITE_PUBLISH_DEBOUNCE_MS, type WebhookDeps } from "../webflow-webhook/index.ts";
import { assertEquals, envelope } from "./helpers.ts";

const EVENTS = "6845d39c294d60e4c197cee9";
const LOCATIONS = "6843bee91e942f36fd3adc06";
const NOW = "2026-10-10T12:00:00.000Z";
const LATER = "2026-10-10T12:00:05.000Z";

const eventItem = {
  ...envelope,
  id: "event-123",
  lastUpdated: "2026-06-02T12:00:00.000Z",
  fieldData: {
    name: "Event 123",
    slug: "event-123",
    "start-date-time": "2026-07-03T22:00:00.000Z",
    "external-link": "https://www.instagram.com/p/abc/"
  }
};

type Recorder = {
  upserts: { table: string; rows: readonly Record<string, unknown>[] }[];
  writes: { rows: readonly Record<string, unknown>[]; observedAt: string; pendingIds: string[] }[];
  liveCalls: { ids: readonly string[]; isLive: boolean; observedAt: string }[];
  orgReplacements: string[];
  background: Promise<unknown>[];
  refreshes: string[];
  heroFetches: { eventId: string; link: string | null }[];
};

function record(): Recorder {
  return { upserts: [], writes: [], liveCalls: [], orgReplacements: [], background: [], refreshes: [], heroFetches: [] };
}

function handlerWith(rec: Recorder, overrides: WebhookDeps = {}) {
  return createWebhookHandler({
    env: (key) => ({ GULCH_WEBHOOK_SECRET: "right", GULCH_WEBFLOW_API_KEY: "webflow" })[key],
    fetchLiveItemFn: async () => eventItem,
    loadKnownOrganizerIds: async () => new Set<string>(),
    upsert: async (table, rows) => {
      rec.upserts.push({ table, rows: rows as readonly Record<string, unknown>[] });
    },
    applyEventRows: async (rows, observedAt, pendingIds) => {
      rec.writes.push({ rows: rows as readonly Record<string, unknown>[], observedAt, pendingIds: [...pendingIds] });
      return { inserted: 0, updated: rows.length, stale: 0, pendingMarked: pendingIds.size };
    },
    replaceEventOrganizers: async (eventId) => {
      rec.orgReplacements.push(eventId);
      return { inserted: 0, skipped: 0 };
    },
    setEventsLive: async (ids, isLive, observedAt) => {
      rec.liveCalls.push({ ids, isLive, observedAt });
      return { updated: ids.length };
    },
    waitUntil: (promise) => {
      rec.background.push(promise);
    },
    runRefresh: async (source) => {
      rec.refreshes.push(source);
      return {} as never;
    },
    lastSiteRefreshStartedAt: async () => null,
    loadEventImageState: async () => ({ image_status: "pending", external_link: eventItem.fieldData["external-link"] }),
    fetchHeroImage: async (eventId, link) => {
      rec.heroFetches.push({ eventId, link });
      return "ok";
    },
    now: () => NOW,
    ...overrides
  });
}

function post(body: unknown): Request {
  return new Request("https://example.test?secret=right", { method: "POST", body: JSON.stringify(body) });
}

const publishEvent = () => post({ triggerType: "collection_item_published", payload: { collectionId: EVENTS, id: "event-123" } });

Deno.test("published event is written live, stamped with the time taken before the Webflow fetch, and its pending hero image is fetched", async () => {
  const rec = record();
  let clock = 0;
  let clockAtFetch = -1;
  const response = await handlerWith(rec, {
    now: () => (clock++ === 0 ? NOW : LATER),
    fetchLiveItemFn: async () => {
      clockAtFetch = clock;
      return eventItem;
    }
  })(publishEvent());

  assertEquals(response.status, 200);
  assertEquals(clockAtFetch, 1);
  assertEquals(rec.writes.length, 1);
  assertEquals(rec.writes[0]?.observedAt, NOW);
  assertEquals(rec.writes[0]?.rows[0]?.is_live, true);
  assertEquals(rec.writes[0]?.pendingIds, []);
  assertEquals(rec.orgReplacements, ["event-123"]);
  assertEquals(rec.upserts, []);
  await Promise.all(rec.background);
  assertEquals(rec.heroFetches, [{ eventId: "event-123", link: "https://www.instagram.com/p/abc/" }]);
});

Deno.test("hero image is not fetched when the event already has one", async () => {
  const rec = record();
  await handlerWith(rec, {
    loadEventImageState: async () => ({ image_status: "ok", external_link: "https://www.instagram.com/p/abc/" })
  })(post({ triggerType: "collection_item_created", payload: { collectionId: EVENTS, id: "event-123" } }));

  assertEquals(rec.writes.length, 1);
  assertEquals(rec.writes[0]?.pendingIds, []);
  assertEquals(rec.background.length, 0);
  assertEquals(rec.heroFetches, []);
});

// The image state is read before the write; a changed link rides inside the
// same ordered write as image_status = pending, so it can neither be lost
// to the upsert nor reset a newer worker's result.
Deno.test("published edit that changes external_link resets the image inside the ordered write and fetches the new one", async () => {
  const rec = record();
  let writesWhenStateLoaded = -1;
  await handlerWith(rec, {
    loadEventImageState: async () => {
      writesWhenStateLoaded = rec.writes.length;
      return { image_status: "ok", external_link: "https://www.instagram.com/p/old/" };
    }
  })(publishEvent());

  assertEquals(writesWhenStateLoaded, 0);
  assertEquals(rec.writes[0]?.pendingIds, ["event-123"]);
  await Promise.all(rec.background);
  assertEquals(rec.heroFetches, [{ eventId: "event-123", link: "https://www.instagram.com/p/abc/" }]);
});

Deno.test("published edit that removes external_link resets the image so the old hero is dropped", async () => {
  const rec = record();
  const { "external-link": _removed, ...fieldsWithoutLink } = eventItem.fieldData;
  await handlerWith(rec, {
    fetchLiveItemFn: async () => ({ ...eventItem, fieldData: fieldsWithoutLink }),
    loadEventImageState: async () => ({ image_status: "ok", external_link: "https://www.instagram.com/p/abc/" })
  })(publishEvent());

  assertEquals(rec.writes[0]?.pendingIds, ["event-123"]);
  await Promise.all(rec.background);
  assertEquals(rec.heroFetches, [{ eventId: "event-123", link: null }]);
});

Deno.test("brand-new event with no row yet is inserted and fetches its hero image without a pending reset", async () => {
  const rec = record();
  await handlerWith(rec, {
    loadEventImageState: async () => null,
    applyEventRows: async (rows, observedAt, pendingIds) => {
      rec.writes.push({ rows: rows as readonly Record<string, unknown>[], observedAt, pendingIds: [...pendingIds] });
      return { inserted: 1, updated: 0, stale: 0, pendingMarked: 0 };
    }
  })(post({ triggerType: "collection_item_created", payload: { collectionId: EVENTS, id: "event-123" } }));

  assertEquals(rec.writes[0]?.pendingIds, []);
  await Promise.all(rec.background);
  assertEquals(rec.heroFetches, [{ eventId: "event-123", link: "https://www.instagram.com/p/abc/" }]);
});

// A brand-new row carries no observation an earlier unpublish could have
// beaten: a hide that arrived before the insert matched nothing. After an
// insert the handler re-reads Webflow once, with a fresh observation, and
// hides if the item is already gone. Updated rows need no re-read.
Deno.test("brand-new event unpublished before its insert landed is hidden right after the insert", async () => {
  const rec = record();
  let fetches = 0;
  let clock = 0;
  const response = await handlerWith(rec, {
    now: () => (clock++ === 0 ? NOW : LATER),
    loadEventImageState: async () => null,
    fetchLiveItemFn: async () => (++fetches === 1 ? eventItem : null),
    applyEventRows: async () => ({ inserted: 1, updated: 0, stale: 0, pendingMarked: 0 })
  })(publishEvent());

  assertEquals(await response.json(), { ok: true, hidden: 1 });
  assertEquals(fetches, 2);
  assertEquals(rec.liveCalls, [{ ids: ["event-123"], isLive: false, observedAt: LATER }]);
  assertEquals(rec.orgReplacements, []);
  assertEquals(rec.heroFetches, []);
});

Deno.test("updated event is written from a single Webflow read", async () => {
  const rec = record();
  let fetches = 0;
  await handlerWith(rec, {
    fetchLiveItemFn: async () => {
      fetches += 1;
      return eventItem;
    }
  })(publishEvent());

  assertEquals(fetches, 1);
  assertEquals(rec.liveCalls, []);
});

Deno.test("re-published event with an unchanged link and a failed image is left to the images job", async () => {
  const rec = record();
  await handlerWith(rec, {
    loadEventImageState: async () => ({ image_status: "failed", external_link: "https://www.instagram.com/p/abc/" })
  })(publishEvent());

  assertEquals(rec.writes[0]?.pendingIds, []);
  assertEquals(rec.heroFetches, []);
});

// A handler whose snapshot is older than what the row already holds (a newer
// publish, or an unpublish received after this handler's fetch began) must
// leave nothing behind: no organizers, no image reset, no hero fetch.
Deno.test("publish whose observation lost to a newer write stops without touching organizers or the image", async () => {
  const rec = record();
  const response = await handlerWith(rec, {
    applyEventRows: async () => ({ inserted: 0, updated: 0, stale: 1, pendingMarked: 0 }),
    loadEventImageState: async () => ({ image_status: "ok", external_link: "https://www.instagram.com/p/old/" })
  })(publishEvent());

  assertEquals(await response.json(), { ok: true, stale: true });
  assertEquals(rec.orgReplacements, []);
  assertEquals(rec.background.length, 0);
  assertEquals(rec.heroFetches, []);
});

Deno.test("published item that is not live on Webflow is skipped", async () => {
  const rec = record();
  const response = await handlerWith(rec, { fetchLiveItemFn: async () => null })(publishEvent());

  assertEquals(await response.json(), { ok: true, skipped: "not live" });
  assertEquals(rec.writes, []);
  assertEquals(rec.upserts, []);
});

Deno.test("unpublished and deleted events are hidden with the receipt time as their observation, never removed", async () => {
  const rec = record();
  const handler = handlerWith(rec);

  const unpublished = await handler(post({
    triggerType: "collection_item_unpublished",
    payload: { collectionId: EVENTS, id: "event-123" }
  }));
  const deleted = await handler(post({
    triggerType: "collection_item_deleted",
    payload: { collectionId: EVENTS, id: "event-456" }
  }));

  assertEquals(await unpublished.json(), { ok: true, hidden: 1 });
  assertEquals(await deleted.json(), { ok: true, hidden: 1 });
  assertEquals(rec.liveCalls, [
    { ids: ["event-123"], isLive: false, observedAt: NOW },
    { ids: ["event-456"], isLive: false, observedAt: NOW }
  ]);
  assertEquals(rec.writes, []);
  assertEquals(rec.upserts, []);
});

Deno.test("unpublishing a non-event collection item is acknowledged and ignored", async () => {
  const rec = record();
  const response = await handlerWith(rec)(post({
    triggerType: "collection_item_unpublished",
    payload: { collectionId: LOCATIONS, id: "location-1" }
  }));

  assertEquals(await response.json(), { ok: true, ignored: "locations" });
  assertEquals(rec.liveCalls, []);
});

Deno.test("staged edits (collection_item_changed) do not touch the database", async () => {
  const rec = record();
  const response = await handlerWith(rec)(post({
    triggerType: "collection_item_changed",
    payload: { collectionId: EVENTS, id: "event-123" }
  }));

  assertEquals(await response.json(), { ok: true });
  assertEquals(rec.writes, []);
  assertEquals(rec.upserts, []);
  assertEquals(rec.liveCalls, []);
});

Deno.test("hide triggers without item identifiers are rejected", async () => {
  const rec = record();
  const response = await handlerWith(rec)(post({ triggerType: "collection_item_deleted", payload: {} }));
  assertEquals(response.status, 400);
});

Deno.test("site_publish schedules a full reconcile in the background and responds immediately", async () => {
  const rec = record();
  const response = await handlerWith(rec)(post({
    triggerType: "site_publish",
    payload: { siteId: "site-1", publishedOn: NOW, domains: ["gulchmagazine.com"] }
  }));

  assertEquals(await response.json(), { ok: true, scheduled: "reconcile" });
  assertEquals(rec.background.length, 1);
  await Promise.all(rec.background);
  assertEquals(rec.refreshes, ["site_publish"]);
});

Deno.test("site_publish is debounced inside the window and runs again outside it", async () => {
  const insideWindow = new Date(Date.parse(NOW) - SITE_PUBLISH_DEBOUNCE_MS + 1000).toISOString();
  const outsideWindow = new Date(Date.parse(NOW) - SITE_PUBLISH_DEBOUNCE_MS - 1000).toISOString();

  const inside = record();
  const debounced = await handlerWith(inside, { lastSiteRefreshStartedAt: async () => insideWindow })(
    post({ triggerType: "site_publish", payload: {} })
  );
  assertEquals(await debounced.json(), { ok: true, debounced: true });
  assertEquals(inside.refreshes, []);

  const outside = record();
  await handlerWith(outside, { lastSiteRefreshStartedAt: async () => outsideWindow })(
    post({ triggerType: "site_publish", payload: {} })
  );
  await Promise.all(outside.background);
  assertEquals(outside.refreshes, ["site_publish"]);
});
