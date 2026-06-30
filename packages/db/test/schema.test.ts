import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupTestPostgres, type TestPostgres } from "./pg";

const { Client } = pg;

describe("v1 mirror schema", () => {
  let postgres: TestPostgres;
  let client: pg.Client;

  beforeAll(async () => {
    postgres = await setupTestPostgres();
    client = new Client({ connectionString: postgres.connectionString });
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }

    if (postgres) {
      await postgres.teardown();
    }
  });

  it("creates the locations, events, shows, organizers, and event_organizers tables with expected columns", async () => {
    const result = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
      column_default: string | null;
    }>(`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('locations', 'events', 'shows', 'organizers', 'event_organizers')
      order by table_name, ordinal_position
    `);

    const columns = new Map(result.rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));

    expect(columns.get("locations.webflow_item_id")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(columns.get("locations.name")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(columns.get("locations.slug")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(columns.get("locations.hide_from_list")).toMatchObject({ data_type: "boolean", is_nullable: "NO" });
    expect(columns.get("locations.latitude")).toMatchObject({ data_type: "double precision", is_nullable: "YES" });
    expect(columns.get("locations.longitude")).toMatchObject({ data_type: "double precision", is_nullable: "YES" });
    expect(columns.get("locations.geocode_status")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(columns.get("locations.is_organizer")).toMatchObject({ data_type: "boolean", is_nullable: "NO" });
    expect(columns.get("locations.managing_organizer_id")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(columns.get("locations.created_at")).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "NO" });
    expect(columns.get("locations.updated_at")).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "NO" });

    expect(columns.get("events.start_at")).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "NO" });
    expect(columns.get("events.end_at")).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "YES" });
    expect(columns.get("events.location_id")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(columns.get("events.external_link")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(columns.get("events.tickets_required")).toMatchObject({ data_type: "boolean", is_nullable: "NO" });

    expect(columns.get("shows.start_date")).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "YES" });
    expect(columns.get("shows.end_date")).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "YES" });
    expect(columns.get("shows.location_id")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(columns.get("shows.external_link")).toMatchObject({ data_type: "text", is_nullable: "YES" });

    expect(columns.get("organizers.webflow_item_id")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(columns.get("organizers.name")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(columns.get("organizers.slug")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(columns.get("organizers.website_url")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(columns.get("organizers.instagram_url")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(columns.get("organizers.facebook_url")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(columns.get("organizers.is_featured")).toMatchObject({ data_type: "boolean", is_nullable: "NO" });
    expect(columns.get("organizers.custom_color")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(columns.get("organizers.webflow_last_updated")).toMatchObject({
      data_type: "timestamp with time zone",
      is_nullable: "YES"
    });

    expect(columns.get("event_organizers.event_id")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(columns.get("event_organizers.organizer_id")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(columns.get("event_organizers.created_at")).toMatchObject({
      data_type: "timestamp with time zone",
      is_nullable: "NO"
    });
  });

  it("enforces a unique slug on locations", async () => {
    const result = await client.query<{ constraint_name: string }>(`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'locations'
        and constraint_type = 'UNIQUE'
        and constraint_name = 'locations_slug_key'
    `);

    expect(result.rowCount).toBe(1);
  });

  it("sets events.location_id as an ON DELETE SET NULL foreign key to locations", async () => {
    const result = await client.query<{ foreign_table: string; delete_action: string }>(`
      select ccu.table_name as foreign_table, rc.delete_rule as delete_action
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on rc.constraint_schema = kcu.constraint_schema
       and rc.constraint_name = kcu.constraint_name
      join information_schema.constraint_column_usage ccu
        on rc.unique_constraint_schema = ccu.constraint_schema
       and rc.unique_constraint_name = ccu.constraint_name
      where kcu.table_schema = 'public'
        and kcu.table_name = 'events'
        and kcu.column_name = 'location_id'
    `);

    expect(result.rows[0]).toEqual({ foreign_table: "locations", delete_action: "SET NULL" });
  });

  it("sets locations.managing_organizer_id as an ON DELETE SET NULL foreign key to organizers", async () => {
    const result = await client.query<{ foreign_table: string; delete_action: string }>(`
      select ccu.table_name as foreign_table, rc.delete_rule as delete_action
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on rc.constraint_schema = kcu.constraint_schema
       and rc.constraint_name = kcu.constraint_name
      join information_schema.constraint_column_usage ccu
        on rc.unique_constraint_schema = ccu.constraint_schema
       and rc.unique_constraint_name = ccu.constraint_name
      where kcu.table_schema = 'public'
        and kcu.table_name = 'locations'
        and kcu.column_name = 'managing_organizer_id'
    `);

    expect(result.rows[0]).toEqual({ foreign_table: "organizers", delete_action: "SET NULL" });
  });

  it("sets event_organizers foreign keys to cascade on event and organizer delete", async () => {
    const result = await client.query<{ column_name: string; foreign_table: string; delete_action: string }>(`
      select kcu.column_name, ccu.table_name as foreign_table, rc.delete_rule as delete_action
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on rc.constraint_schema = kcu.constraint_schema
       and rc.constraint_name = kcu.constraint_name
      join information_schema.constraint_column_usage ccu
        on rc.unique_constraint_schema = ccu.constraint_schema
       and rc.unique_constraint_name = ccu.constraint_name
      where kcu.table_schema = 'public'
        and kcu.table_name = 'event_organizers'
      order by kcu.column_name
    `);

    expect(result.rows).toEqual([
      { column_name: "event_id", foreign_table: "events", delete_action: "CASCADE" },
      { column_name: "organizer_id", foreign_table: "organizers", delete_action: "CASCADE" }
    ]);
  });

  it("sets managing_organizer_id to null when an organizer is deleted", async () => {
    await client.query(
      "insert into public.organizers (webflow_item_id, name, slug) values ($1, $2, $3)",
      ["delete-managed-organizer", "Delete Managed Organizer", "delete-managed-organizer"]
    );
    await client.query(
      "insert into public.locations (webflow_item_id, name, slug, managing_organizer_id) values ($1, $2, $3, $4)",
      ["managed-location", "Managed Location", "managed-location", "delete-managed-organizer"]
    );

    await client.query("delete from public.organizers where webflow_item_id = $1", ["delete-managed-organizer"]);

    const selected = await client.query<{ managing_organizer_id: string | null }>(
      "select managing_organizer_id from public.locations where webflow_item_id = $1",
      ["managed-location"]
    );
    expect(selected.rows[0]?.managing_organizer_id).toBeNull();
  });

  it("cascades event_organizers rows when an event is deleted", async () => {
    await client.query(
      "insert into public.organizers (webflow_item_id, name, slug) values ($1, $2, $3)",
      ["event-cascade-organizer", "Event Cascade Organizer", "event-cascade-organizer"]
    );
    await client.query(
      "insert into public.events (webflow_item_id, name, slug, start_at) values ($1, $2, $3, $4)",
      ["event-cascade-event", "Event Cascade Event", "event-cascade-event", "2026-07-03T22:00:00.000Z"]
    );
    await client.query("insert into public.event_organizers (event_id, organizer_id) values ($1, $2)", [
      "event-cascade-event",
      "event-cascade-organizer"
    ]);

    await client.query("delete from public.events where webflow_item_id = $1", ["event-cascade-event"]);

    const selected = await client.query("select 1 from public.event_organizers where event_id = $1", [
      "event-cascade-event"
    ]);
    expect(selected.rowCount).toBe(0);
  });

  it("cascades event_organizers rows when an organizer is deleted", async () => {
    await client.query(
      "insert into public.organizers (webflow_item_id, name, slug) values ($1, $2, $3)",
      ["organizer-cascade-organizer", "Organizer Cascade Organizer", "organizer-cascade-organizer"]
    );
    await client.query(
      "insert into public.events (webflow_item_id, name, slug, start_at) values ($1, $2, $3, $4)",
      ["organizer-cascade-event", "Organizer Cascade Event", "organizer-cascade-event", "2026-07-04T22:00:00.000Z"]
    );
    await client.query("insert into public.event_organizers (event_id, organizer_id) values ($1, $2)", [
      "organizer-cascade-event",
      "organizer-cascade-organizer"
    ]);

    await client.query("delete from public.organizers where webflow_item_id = $1", ["organizer-cascade-organizer"]);

    const selected = await client.query("select 1 from public.event_organizers where organizer_id = $1", [
      "organizer-cascade-organizer"
    ]);
    expect(selected.rowCount).toBe(0);
  });

  it("rejects invalid geocode_status values", async () => {
    await expect(
      client.query(
        "insert into public.locations (webflow_item_id, name, slug, geocode_status) values ($1, $2, $3, $4)",
        ["bad-geocode", "Bad Geocode", "bad-geocode", "unknown"]
      )
    ).rejects.toThrow(/geocode_status|check constraint/i);
  });

  it("allows service_role to insert an event without external_link", async () => {
    await client.query("set role service_role");

    try {
      await client.query(
        "insert into public.events (webflow_item_id, name, slug, start_at) values ($1, $2, $3, $4)",
        ["event-without-link", "Event Without Link", "event-without-link", "2026-07-03T22:00:00.000Z"]
      );

      const selected = await client.query<{ external_link: string | null }>(
        "select external_link from public.events where webflow_item_id = $1",
        ["event-without-link"]
      );

      expect(selected.rows[0]?.external_link).toBeNull();
    } finally {
      await client.query("reset role");
    }
  });

  it("bumps updated_at before update", async () => {
    await client.query(
      "insert into public.locations (webflow_item_id, name, slug) values ($1, $2, $3)",
      ["trigger-location", "Trigger Location", "trigger-location"]
    );
    const inserted = await client.query<{ updated_at: Date }>(
      "select updated_at from public.locations where webflow_item_id = $1",
      ["trigger-location"]
    );

    await client.query("select pg_sleep(0.01)");
    await client.query("update public.locations set name = $1 where webflow_item_id = $2", [
      "Trigger Location Updated",
      "trigger-location"
    ]);

    const updated = await client.query<{ updated_at: Date }>(
      "select updated_at from public.locations where webflow_item_id = $1",
      ["trigger-location"]
    );

    expect(updated.rows[0]?.updated_at.getTime()).toBeGreaterThan(inserted.rows[0]?.updated_at.getTime() ?? 0);
  });
});
