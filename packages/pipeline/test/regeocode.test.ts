import { describe, expect, it } from "vitest";

import { runRegeocode, type RegeocodeDbClient } from "../src/regeocode";

describe("runRegeocode", () => {
  it("updates only failed locations that now geocode successfully", async () => {
    const selectedRows = [
      { webflow_item_id: "fixed-location", name_address: "10 Krog St NE" },
      { webflow_item_id: "still-failed-location", name_address: "Virtual" }
    ] as const;
    const updates: { readonly id: string; readonly values: unknown }[] = [];
    const filters: string[] = [];
    const geocodedAddresses: string[] = [];
    const db: RegeocodeDbClient = {
      from: (table) => {
        expect(table).toBe("locations");
        return {
          select: (columns) => {
            expect(columns).toBe("webflow_item_id,name_address");
            return {
              eq: (column, value) => {
                filters.push(`${column}:${value}`);
                return {
                  not: async (notColumn, operator, notValue) => {
                    filters.push(`${notColumn}:${operator}:${String(notValue)}`);
                    return { data: selectedRows, error: null };
                  }
                };
              }
            };
          },
          update: (values) => ({
            eq: async (column, value) => {
              expect(column).toBe("webflow_item_id");
              updates.push({ id: value, values });
              return { error: null };
            }
          })
        };
      }
    };

    const summary = await runRegeocode({
      db,
      geocoder: {
        geocode: async (address) => {
          geocodedAddresses.push(address);
          return address === "10 Krog St NE"
            ? { latitude: 33.772, longitude: -84.371, status: "ok" }
            : { latitude: null, longitude: null, status: "failed" };
        }
      }
    });

    expect(filters).toEqual(["geocode_status:failed", "name_address:is:null"]);
    expect(geocodedAddresses).toEqual(["10 Krog St NE", "Virtual"]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "fixed-location",
      values: {
        latitude: 33.772,
        longitude: -84.371,
        geocode_status: "ok"
      }
    });
    expect(updates[0]?.values).toHaveProperty("geocoded_at", expect.any(String));
    expect(updates.map((update) => update.id)).not.toContain("already-ok-location");
    expect(summary).toEqual({ scanned: 2, fixed: 1, stillFailed: 1 });
  });

  it("throws a clear error when loading failed locations fails", async () => {
    const db: RegeocodeDbClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            not: async () => ({ data: null, error: { message: "permission denied" } })
          })
        }),
        update: () => ({
          eq: async () => ({ error: null })
        })
      })
    };

    await expect(
      runRegeocode({
        db,
        geocoder: {
          geocode: async () => ({ latitude: 33.772, longitude: -84.371, status: "ok" })
        }
      })
    ).rejects.toThrow(/Failed to load failed locations: permission denied/);
  });

  it("throws a clear error when updating a fixed location fails", async () => {
    const db: RegeocodeDbClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            not: async () => ({
              data: [{ webflow_item_id: "fixed-location", name_address: "10 Krog St NE" }],
              error: null
            })
          })
        }),
        update: () => ({
          eq: async () => ({ error: { message: "write denied" } })
        })
      })
    };

    await expect(
      runRegeocode({
        db,
        geocoder: {
          geocode: async () => ({ latitude: 33.772, longitude: -84.371, status: "ok" })
        }
      })
    ).rejects.toThrow(/Failed to update location fixed-location: write denied/);
  });
});
