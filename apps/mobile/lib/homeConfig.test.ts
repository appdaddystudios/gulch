import { describe, expect, it } from "vitest";

import {
  getHomeConfig,
  HOME_CONFIG_DEFAULTS,
  HOME_CONFIG_SELECT,
} from "./homeConfig";

type QueryResult = { data: unknown; error: unknown };

const makeClient = (result: QueryResult, onSelect?: (columns: string) => void) => {
  const builder: Record<string, unknown> = {};
  builder.select = (columns: string) => {
    onSelect?.(columns);
    return builder;
  };
  builder.eq = () => builder;
  builder.maybeSingle = () => Promise.resolve(result);
  return { from: () => builder } as never;
};

const baseRow = {
  research_label: "Take the Survey",
  research_url: "https://www.gulchmagazine.com/research",
  banner_enabled: false,
  banner_title: null,
  banner_body: null,
  banner_image_url: null,
  banner_link_url: null,
};

describe("getHomeConfig", () => {
  it("requests the config columns and maps the row", async () => {
    let selected = "";
    const config = await getHomeConfig(
      makeClient(
        {
          data: {
            ...baseRow,
            research_label: "Join the Study",
            research_url: "https://example.com/study",
          },
          error: null,
        },
        (columns) => {
          selected = columns;
        },
      ),
    );

    expect(selected).toBe(HOME_CONFIG_SELECT);
    expect(config.researchLabel).toBe("Join the Study");
    expect(config.researchUrl).toBe("https://example.com/study");
    expect(config.bannerAd).toBeNull();
  });

  it("falls back to defaults on missing row, error, throw, and malformed data", async () => {
    await expect(
      getHomeConfig(makeClient({ data: null, error: null })),
    ).resolves.toEqual(HOME_CONFIG_DEFAULTS);

    await expect(
      getHomeConfig(makeClient({ data: null, error: new Error("rls") })),
    ).resolves.toEqual(HOME_CONFIG_DEFAULTS);

    const throwingClient = {
      from: () => {
        throw new Error("network down");
      },
    } as never;
    await expect(getHomeConfig(throwingClient)).resolves.toEqual(
      HOME_CONFIG_DEFAULTS,
    );

    await expect(
      getHomeConfig(makeClient({ data: { research_label: 42 }, error: null })),
    ).resolves.toEqual(HOME_CONFIG_DEFAULTS);
  });

  it("hides the banner when disabled even if content is set", async () => {
    const config = await getHomeConfig(
      makeClient({
        data: {
          ...baseRow,
          banner_enabled: false,
          banner_title: "Big Sale",
          banner_image_url: "https://cdn.example.com/ad.png",
        },
        error: null,
      }),
    );
    expect(config.bannerAd).toBeNull();
  });

  it("prefers image mode over text mode when both are set", async () => {
    const config = await getHomeConfig(
      makeClient({
        data: {
          ...baseRow,
          banner_enabled: true,
          banner_title: "Big Sale",
          banner_body: "Half off",
          banner_image_url: "https://cdn.example.com/ad.png",
          banner_link_url: "https://example.com/sale",
        },
        error: null,
      }),
    );
    expect(config.bannerAd).toEqual({
      kind: "image",
      imageUrl: "https://cdn.example.com/ad.png",
      linkUrl: "https://example.com/sale",
    });
  });

  it("uses text mode when enabled with a title and no image", async () => {
    const config = await getHomeConfig(
      makeClient({
        data: {
          ...baseRow,
          banner_enabled: true,
          banner_title: "Big Sale",
          banner_body: "Half off",
        },
        error: null,
      }),
    );
    expect(config.bannerAd).toEqual({
      kind: "text",
      title: "Big Sale",
      body: "Half off",
      linkUrl: null,
    });
  });

  it("hides the banner when enabled but empty", async () => {
    const config = await getHomeConfig(
      makeClient({
        data: { ...baseRow, banner_enabled: true },
        error: null,
      }),
    );
    expect(config.bannerAd).toBeNull();
  });
});
