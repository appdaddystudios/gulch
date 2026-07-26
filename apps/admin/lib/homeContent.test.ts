import { describe, expect, it } from "vitest";

import {
  HOMEPAGE_CONFIG_SELECT,
  getHomepageConfig,
  updateHomepageConfig,
  type ConfigClient
} from "./homeContent";

type QueryResult = { readonly data: unknown; readonly error: unknown };

type RecordedCall = {
  readonly method: string;
  readonly args: readonly unknown[];
};

const makeClient = (result: QueryResult, calls: RecordedCall[] = []): ConfigClient => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "update", "eq", "maybeSingle"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return { from: () => builder } as never;
};

const configRow = {
  research_label: "Take the Survey",
  research_url: "https://example.com/research",
  banner_enabled: true,
  banner_title: "Big Show",
  banner_body: null,
  banner_image_url: null,
  banner_link_url: "https://example.com/show"
};

describe("getHomepageConfig", () => {
  it("selects the config columns from the single row", async () => {
    const calls: RecordedCall[] = [];

    await expect(getHomepageConfig(makeClient({ data: configRow, error: null }, calls))).resolves.toEqual({
      researchLabel: "Take the Survey",
      researchUrl: "https://example.com/research",
      bannerEnabled: true,
      bannerTitle: "Big Show",
      bannerBody: null,
      bannerImageUrl: null,
      bannerLinkUrl: "https://example.com/show"
    });

    expect(calls).toEqual([
      { method: "select", args: [HOMEPAGE_CONFIG_SELECT] },
      { method: "eq", args: ["id", 1] },
      { method: "maybeSingle", args: [] }
    ]);
  });

  it("throws when Supabase returns an error", async () => {
    await expect(
      getHomepageConfig(makeClient({ data: null, error: { message: "boom" } }))
    ).rejects.toThrow("Failed to load homepage config: boom");
  });

  it("throws when the config row is missing", async () => {
    await expect(getHomepageConfig(makeClient({ data: null, error: null }))).rejects.toThrow(
      "homepage_config row is missing"
    );
  });
});

describe("updateHomepageConfig", () => {
  it("updates the single row and verifies a row was affected", async () => {
    const calls: RecordedCall[] = [];

    await expect(
      updateHomepageConfig(makeClient({ data: [{ id: 1 }], error: null }, calls), {
        research_label: "New Label"
      })
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      { method: "update", args: [{ research_label: "New Label" }] },
      { method: "eq", args: ["id", 1] },
      { method: "select", args: ["id"] }
    ]);
  });

  it("is a no-op for an empty update", async () => {
    const calls: RecordedCall[] = [];

    await expect(
      updateHomepageConfig(makeClient({ data: [], error: null }, calls), {})
    ).resolves.toBeUndefined();

    expect(calls).toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    await expect(
      updateHomepageConfig(makeClient({ data: null, error: { message: "denied" } }), {
        banner_enabled: false
      })
    ).rejects.toThrow("Failed to update homepage config: denied");
  });

  it("throws when zero rows are affected (silent RLS block)", async () => {
    await expect(
      updateHomepageConfig(makeClient({ data: [], error: null }), { banner_enabled: true })
    ).rejects.toThrow("Homepage config update affected no rows");
  });
});
