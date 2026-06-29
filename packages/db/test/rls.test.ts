import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupTestPostgres, type TestPostgres } from "./pg";

const { Client } = pg;

const expectDenied = async (query: Promise<unknown>): Promise<void> => {
  await expect(query).rejects.toThrow(/permission denied|row-level security/i);
};

describe("v1 mirror RLS", () => {
  let postgres: TestPostgres;
  let client: pg.Client;

  beforeAll(async () => {
    postgres = await setupTestPostgres();
    client = new Client({ connectionString: postgres.connectionString });
    await client.connect();

    await client.query("set role service_role");
    await client.query(
      "insert into public.locations (webflow_item_id, name, slug) values ($1, $2, $3)",
      ["visible-location", "Visible Location", "visible-location"]
    );
    await client.query("reset role");
  });

  afterAll(async () => {
    await client.end();
    await postgres.teardown();
  });

  it("allows anon to select and denies anon writes", async () => {
    await client.query("set role anon");

    const selected = await client.query("select webflow_item_id from public.locations where webflow_item_id = $1", [
      "visible-location"
    ]);
    expect(selected.rowCount).toBe(1);

    await expectDenied(
      client.query("insert into public.locations (webflow_item_id, name, slug) values ($1, $2, $3)", [
        "anon-insert",
        "Anon Insert",
        "anon-insert"
      ])
    );
    await expectDenied(
      client.query("update public.locations set name = $1 where webflow_item_id = $2", [
        "Anon Update",
        "visible-location"
      ])
    );
    await expectDenied(client.query("delete from public.locations where webflow_item_id = $1", ["visible-location"]));

    await client.query("reset role");
  });

  it("allows authenticated to select and denies authenticated writes", async () => {
    await client.query("set role authenticated");

    const selected = await client.query("select webflow_item_id from public.locations where webflow_item_id = $1", [
      "visible-location"
    ]);
    expect(selected.rowCount).toBe(1);

    await expectDenied(
      client.query("insert into public.locations (webflow_item_id, name, slug) values ($1, $2, $3)", [
        "authenticated-insert",
        "Authenticated Insert",
        "authenticated-insert"
      ])
    );
    await expectDenied(
      client.query("update public.locations set name = $1 where webflow_item_id = $2", [
        "Authenticated Update",
        "visible-location"
      ])
    );
    await expectDenied(client.query("delete from public.locations where webflow_item_id = $1", ["visible-location"]));

    await client.query("reset role");
  });

  it("allows service_role full CRUD", async () => {
    await client.query("set role service_role");

    await client.query(
      "insert into public.locations (webflow_item_id, name, slug) values ($1, $2, $3)",
      ["service-location", "Service Location", "service-location"]
    );
    await client.query(
      "insert into public.events (webflow_item_id, name, slug, start_at, location_id, external_link) values ($1, $2, $3, $4, $5, $6)",
      [
        "service-event",
        "Service Event",
        "service-event",
        "2026-07-01T00:00:00.000Z",
        "service-location",
        "https://example.com/event"
      ]
    );
    await client.query(
      "insert into public.shows (webflow_item_id, name, slug, location_id, external_link) values ($1, $2, $3, $4, $5)",
      ["service-show", "Service Show", "service-show", "service-location", "https://example.com/show"]
    );

    await client.query("update public.locations set neighborhood = $1 where webflow_item_id = $2", [
      "Downtown",
      "service-location"
    ]);

    const updated = await client.query<{ neighborhood: string }>(
      "select neighborhood from public.locations where webflow_item_id = $1",
      ["service-location"]
    );
    expect(updated.rows[0]?.neighborhood).toBe("Downtown");

    await client.query("delete from public.events where webflow_item_id = $1", ["service-event"]);
    await client.query("delete from public.shows where webflow_item_id = $1", ["service-show"]);
    await client.query("delete from public.locations where webflow_item_id = $1", ["service-location"]);

    await client.query("reset role");
  });

  it("makes service_role inserts visible to anon selects", async () => {
    await client.query("set role service_role");
    await client.query(
      "insert into public.locations (webflow_item_id, name, slug) values ($1, $2, $3)",
      ["anon-visible-service-row", "Anon Visible Service Row", "anon-visible-service-row"]
    );

    await client.query("set role anon");
    const selected = await client.query("select name from public.locations where webflow_item_id = $1", [
      "anon-visible-service-row"
    ]);

    expect(selected.rows[0]).toEqual({ name: "Anon Visible Service Row" });
    await client.query("reset role");
  });
});
