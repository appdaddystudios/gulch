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
        EXPO_PUBLIC_SUPABASE_URL: "not-a-url",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon"
      })
    ).toBeNull();
  });

  it("creates a typed Supabase client from Expo public env", () => {
    const client = createMobileSupabase({
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon"
    });

    expect(client).toEqual({
      env: {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_KEY: "anon"
      }
    });
  });
});
