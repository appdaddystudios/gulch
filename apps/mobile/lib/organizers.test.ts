import { describe, expect, it } from "vitest";

import { listFeaturedOrganizers } from "./organizers";

type QueryResult = { data: unknown; error: unknown };

const makeBuilder = (result: QueryResult) => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return builder;
};

const makeClient = (result: QueryResult) =>
  ({ from: () => makeBuilder(result) }) as never;

describe("listFeaturedOrganizers", () => {
  it("maps featured organizer rows", async () => {
    const rows = [
      {
        webflow_item_id: "org-1",
        name: "GULCH Magazine",
        custom_color: "#D9FF71",
        instagram_url: "https://instagram.com/gulch",
      },
      {
        webflow_item_id: "org-2",
        name: "Echo Contemporary",
        custom_color: null,
        instagram_url: null,
      },
    ];

    await expect(listFeaturedOrganizers(makeClient({ data: rows, error: null }))).resolves.toEqual([
      {
        id: "org-1",
        name: "GULCH Magazine",
        customColor: "#D9FF71",
        instagramUrl: "https://instagram.com/gulch",
      },
      {
        id: "org-2",
        name: "Echo Contemporary",
        customColor: null,
        instagramUrl: null,
      },
    ]);
  });

  it("returns an empty list when data is null", async () => {
    await expect(
      listFeaturedOrganizers(makeClient({ data: null, error: null }), { limit: 3 }),
    ).resolves.toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const error = new Error("rls denied");
    await expect(
      listFeaturedOrganizers(makeClient({ data: null, error })),
    ).rejects.toThrow("rls denied");
  });
});
