import { describe, expect, it, vi } from "vitest";

import { createMobileSupabase } from "./supabase";

const createDbClient = vi.hoisted(() => vi.fn((env: unknown) => ({ env })));

vi.mock("@gulch/db", () => ({
  createDbClient
}));

describe("createMobileSupabase", () => {
  it("returns null when Expo public Supabase env is missing", () => {
    expect(createMobileSupabase({})).toBeNull();
  });

  it("returns null when Expo public Supabase env is invalid", () => {
    expect(
      createMobileSupabase({
        url: "not-a-url",
        key: "anon"
      })
    ).toBeNull();
  });

  it("creates a typed Supabase client from Expo public env", () => {
    const client = createMobileSupabase({
      url: "https://example.supabase.co",
      key: "anon"
    });

    expect(client).toEqual({
      env: {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_KEY: "anon"
      }
    });
  });
});
