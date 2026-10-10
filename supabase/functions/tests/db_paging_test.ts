// PostgREST caps a response at max_rows (1000 in supabase/config.toml) and
// the events table is past that. Every whole-table read must page, or the
// presence pass silently ignores the tail of the table.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { loadExistingRows, loadKnownOrganizerIds, SELECT_PAGE_SIZE } from "../_shared/db.ts";
import { assertEquals } from "./helpers.ts";

type Page = { webflow_item_id: string }[];

function fakeClient(pages: Page[], ranges: [number, number][], columns: string[]): SupabaseClient {
  const builder = {
    select: (cols: string) => {
      columns.push(cols);
      return builder;
    },
    order: () => builder,
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: pages.shift() ?? [], error: null };
    }
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

const rows = (count: number, offset = 0): Page =>
  Array.from({ length: count }, (_, index) => ({ webflow_item_id: `id-${offset + index}` }));

Deno.test("loadExistingRows pages past the PostgREST cap until a short page", async () => {
  const ranges: [number, number][] = [];
  const columns: string[] = [];
  const client = fakeClient([rows(SELECT_PAGE_SIZE), rows(281, SELECT_PAGE_SIZE)], ranges, columns);

  const existing = await loadExistingRows(client, "events");

  assertEquals(existing.length, SELECT_PAGE_SIZE + 281);
  assertEquals(existing[SELECT_PAGE_SIZE + 280]?.webflow_item_id, `id-${SELECT_PAGE_SIZE + 280}`);
  assertEquals(ranges, [[0, SELECT_PAGE_SIZE - 1], [SELECT_PAGE_SIZE, 2 * SELECT_PAGE_SIZE - 1]]);
  assertEquals(columns, Array(2).fill("webflow_item_id,webflow_last_updated,external_link,is_live"));
});

Deno.test("loadExistingRows stops after one page when the table is small", async () => {
  const ranges: [number, number][] = [];
  const existing = await loadExistingRows(fakeClient([rows(2)], ranges, []), "shows");

  assertEquals(existing.length, 2);
  assertEquals(ranges, [[0, SELECT_PAGE_SIZE - 1]]);
});

Deno.test("loadKnownOrganizerIds pages the same way", async () => {
  const ranges: [number, number][] = [];
  const ids = await loadKnownOrganizerIds(fakeClient([rows(SELECT_PAGE_SIZE), rows(1, SELECT_PAGE_SIZE)], ranges, []));

  assertEquals(ids.size, SELECT_PAGE_SIZE + 1);
  assertEquals(ranges.length, 2);
});
