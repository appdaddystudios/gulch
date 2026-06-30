import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupTestPostgres, type TestPostgres } from "./pg";

const { Client } = pg;

const expectDenied = async (query: Promise<unknown>): Promise<void> => {
  await expect(query).rejects.toThrow(/permission denied|row-level security/i);
};

const expectDeniedCode = async (query: Promise<unknown>): Promise<void> => {
  try {
    await query;
    throw new Error("Expected query to be denied");
  } catch (error) {
    expect((error as { readonly code?: string }).code).toBe("42501");
  }
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
    await client.query(
      "insert into public.organizers (webflow_item_id, name, slug) values ($1, $2, $3)",
      ["visible-organizer", "Visible Organizer", "visible-organizer"]
    );
    await client.query(
      "insert into public.events (webflow_item_id, name, slug, start_at) values ($1, $2, $3, $4)",
      ["visible-event", "Visible Event", "visible-event", "2026-07-01T00:00:00.000Z"]
    );
    await client.query("insert into public.event_organizers (event_id, organizer_id) values ($1, $2)", [
      "visible-event",
      "visible-organizer"
    ]);
    await client.query("reset role");
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }

    if (postgres) {
      await postgres.teardown();
    }
  });

  it("allows anon to select and denies anon writes", async () => {
    await client.query("set role anon");

    const selected = await client.query("select webflow_item_id from public.locations where webflow_item_id = $1", [
      "visible-location"
    ]);
    expect(selected.rowCount).toBe(1);

    const selectedOrganizer = await client.query(
      "select webflow_item_id from public.organizers where webflow_item_id = $1",
      ["visible-organizer"]
    );
    expect(selectedOrganizer.rowCount).toBe(1);

    const selectedEventOrganizer = await client.query(
      "select event_id, organizer_id from public.event_organizers where event_id = $1",
      ["visible-event"]
    );
    expect(selectedEventOrganizer.rowCount).toBe(1);

    await expectDeniedCode(
      client.query("insert into public.locations (webflow_item_id, name, slug) values ($1, $2, $3)", [
        "anon-insert",
        "Anon Insert",
        "anon-insert"
      ])
    );
    await expectDeniedCode(
      client.query("insert into public.organizers (webflow_item_id, name, slug) values ($1, $2, $3)", [
        "anon-organizer-insert",
        "Anon Organizer Insert",
        "anon-organizer-insert"
      ])
    );
    await expectDeniedCode(
      client.query("insert into public.event_organizers (event_id, organizer_id) values ($1, $2)", [
        "visible-event",
        "visible-organizer"
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
      "insert into public.organizers (webflow_item_id, name, slug) values ($1, $2, $3)",
      ["service-organizer", "Service Organizer", "service-organizer"]
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
    await client.query("insert into public.event_organizers (event_id, organizer_id) values ($1, $2)", [
      "service-event",
      "service-organizer"
    ]);
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

    const linked = await client.query<{ organizer_id: string }>(
      "select organizer_id from public.event_organizers where event_id = $1",
      ["service-event"]
    );
    expect(linked.rows[0]?.organizer_id).toBe("service-organizer");

    await client.query("delete from public.events where webflow_item_id = $1", ["service-event"]);
    await client.query("delete from public.shows where webflow_item_id = $1", ["service-show"]);
    await client.query("delete from public.organizers where webflow_item_id = $1", ["service-organizer"]);
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
