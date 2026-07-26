import { describe, expect, it, vi } from "vitest";

import { createServerSupabase, createServiceSupabase } from "./supabase";

describe("createServerSupabase", () => {
  it("reads request-time env when no env override is provided", () => {
    const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    expect(createServerSupabase()).toBeNull();

    if (previousUrl) {
      process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
    } else {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    }

    if (previousKey) {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = previousKey;
    } else {
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    }

    info.mockRestore();
  });

  it("returns null when request-time env is missing", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    expect(createServerSupabase({})).toBeNull();
    expect(info).toHaveBeenCalledWith("Supabase admin client not created: missing public Supabase URL or anon key.");

    info.mockRestore();
  });

  it("returns a Supabase client when request-time env is present", () => {
    const client = createServerSupabase({
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key"
    });

    expect(client).not.toBeNull();
    expect(typeof client?.from).toBe("function");
  });

  it("returns null for invalid Supabase configuration", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(
      createServerSupabase({
        EXPO_PUBLIC_SUPABASE_URL: "not-a-url",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key"
      })
    ).toBeNull();
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });
});

describe("createServiceSupabase", () => {
  it("returns null when the service role key is missing", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    expect(createServiceSupabase({ EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toBeNull();
    expect(info).toHaveBeenCalledWith(
      "Supabase service client not created: missing Supabase URL or service role key."
    );

    info.mockRestore();
  });

  it("returns a Supabase client when service env is present", () => {
    const client = createServiceSupabase({
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
    });

    expect(client).not.toBeNull();
    expect(typeof client?.from).toBe("function");
  });

  it("returns null for invalid Supabase configuration", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(
      createServiceSupabase({
        EXPO_PUBLIC_SUPABASE_URL: "not-a-url",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      })
    ).toBeNull();
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });
});
