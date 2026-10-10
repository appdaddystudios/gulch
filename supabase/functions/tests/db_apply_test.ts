// applyEventRows against a scripted fake client: each select() pops the next
// list of matched ids, and every call records its fields and filter chain.
// The pending reset for a link change is decided inside the UPDATE against
// the row's current link, never against the snapshot the candidate list came
// from, so a hero completed meanwhile is never reset.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { applyEventRows } from "../_shared/db.ts";
import type { EventRow } from "../_shared/mappers.ts";
import { assertEquals } from "./helpers.ts";

type Call = { kind: "upsert" | "update"; fields: Record<string, unknown>; filters: string[] };

function fakeClient(results: string[][], calls: Call[]): SupabaseClient {
  const chain = (call: Call) => {
    const builder = {
      eq: (column: string, value: unknown) => {
        call.filters.push(`${column}.eq.${String(value)}`);
        return builder;
      },
      or: (filter: string) => {
        call.filters.push(`or(${filter})`);
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        call.filters.push(`${column}.not.${operator}.${String(value)}`);
        return builder;
      },
      select: async () => ({ data: (results.shift() ?? []).map((id) => ({ webflow_item_id: id })), error: null })
    };
    return builder;
  };
  return {
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => {
        const call: Call = { kind: "upsert", fields: rows[0] ?? {}, filters: [] };
        calls.push(call);
        return chain(call);
      },
      update: (fields: Record<string, unknown>) => {
        const call: Call = { kind: "update", fields, filters: [] };
        calls.push(call);
        return chain(call);
      }
    })
  } as unknown as SupabaseClient;
}

const T0 = "2026-10-10T12:00:00.000Z";
const LINK = "https://www.instagram.com/p/new/";
const ORDERED = `or(observed_at.is.null,observed_at.lte.${T0})`;

const row = (id: string, link: string | null): EventRow => ({
  webflow_item_id: id,
  name: id,
  slug: id,
  start_at: "2026-07-01T00:00:00.000Z",
  end_at: null,
  custom_time_description: null,
  location_id: null,
  external_link: link,
  tickets_required: false,
  editors_pick: false,
  is_live: true,
  webflow_last_updated: "2026-06-01T00:00:00.000Z"
});

Deno.test("a new row is inserted once and takes no update", async () => {
  const calls: Call[] = [];
  const result = await applyEventRows(fakeClient([["e1"]], calls), [row("e1", LINK)], T0, new Set());

  assertEquals(result, { insertedIds: ["e1"], updated: 0, stale: 0, pendingMarkedIds: [] });
  assertEquals(calls.map((call) => call.kind), ["upsert"]);
  assertEquals(calls[0]?.fields.observed_at, T0);
});

Deno.test("an existing row without a link change takes one ordered update", async () => {
  const calls: Call[] = [];
  const result = await applyEventRows(fakeClient([[], ["e1"]], calls), [row("e1", LINK)], T0, new Set());

  assertEquals(result, { insertedIds: [], updated: 1, stale: 0, pendingMarkedIds: [] });
  assertEquals(calls.map((call) => call.kind), ["upsert", "update"]);
  assertEquals("image_status" in (calls[1]?.fields ?? {}), false);
  assertEquals(calls[1]?.filters, ["webflow_item_id.eq.e1", ORDERED]);
});

Deno.test("a link-change candidate resets pending only if the row's current link differs, decided inside the update", async () => {
  const calls: Call[] = [];
  const result = await applyEventRows(fakeClient([[], ["e1"]], calls), [row("e1", LINK)], T0, new Set(["e1"]));

  assertEquals(result, { insertedIds: [], updated: 1, stale: 0, pendingMarkedIds: ["e1"] });
  assertEquals(calls.map((call) => call.kind), ["upsert", "update"]);
  assertEquals(calls[1]?.fields.image_status, "pending");
  assertEquals(calls[1]?.filters, [
    "webflow_item_id.eq.e1",
    ORDERED,
    `or(external_link.is.null,external_link.neq."${LINK}")`
  ]);
});

Deno.test("a candidate whose row already holds the new link falls back to a plain ordered update without a reset", async () => {
  const calls: Call[] = [];
  const result = await applyEventRows(fakeClient([[], [], ["e1"]], calls), [row("e1", LINK)], T0, new Set(["e1"]));

  assertEquals(result, { insertedIds: [], updated: 1, stale: 0, pendingMarkedIds: [] });
  assertEquals(calls.map((call) => call.kind), ["upsert", "update", "update"]);
  assertEquals("image_status" in (calls[2]?.fields ?? {}), false);
  assertEquals(calls[2]?.filters, ["webflow_item_id.eq.e1", ORDERED]);
});

Deno.test("a candidate that matches neither update is stale", async () => {
  const calls: Call[] = [];
  const result = await applyEventRows(fakeClient([[], [], []], calls), [row("e1", LINK)], T0, new Set(["e1"]));

  assertEquals(result, { insertedIds: [], updated: 0, stale: 1, pendingMarkedIds: [] });
});

Deno.test("a candidate whose new link is null requires the row's current link to be set", async () => {
  const calls: Call[] = [];
  await applyEventRows(fakeClient([[], ["e1"]], calls), [row("e1", null)], T0, new Set(["e1"]));

  assertEquals(calls[1]?.filters, ["webflow_item_id.eq.e1", ORDERED, "external_link.not.is.null"]);
});
