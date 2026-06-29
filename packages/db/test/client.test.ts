import { describe, expect, it } from "vitest";

import { createDbClient } from "../src";

describe("createDbClient", () => {
  it("creates a typed Supabase client from valid explicit values", () => {
    const client = createDbClient({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_KEY: "test-key"
    });

    expect(client.schema).toEqual(expect.any(Function));
    expect(client.from("locations")).toBeDefined();
  });

  it("throws a clear error when required values are missing", () => {
    expect(() => createDbClient({})).toThrow(/Invalid Supabase client configuration: .*SUPABASE_URL.*SUPABASE_KEY/s);
  });

  it("throws a clear error when the url is invalid", () => {
    expect(() =>
      createDbClient({
        SUPABASE_URL: "not-a-url",
        SUPABASE_KEY: "test-key"
      })
    ).toThrow(/Invalid Supabase client configuration: .*SUPABASE_URL.*Invalid url/is);
  });
});
