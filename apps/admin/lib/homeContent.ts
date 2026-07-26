import type { DbClient } from "@gulch/db";

// Admin read/write helpers for the homepage_config single row (id = 1).
// Unlike the mobile reader (fail-safe defaults), admin surfaces errors loudly.

export type HomepageConfig = {
  readonly researchLabel: string;
  readonly researchUrl: string;
  readonly bannerEnabled: boolean;
  readonly bannerTitle: string | null;
  readonly bannerBody: string | null;
  readonly bannerImageUrl: string | null;
  readonly bannerLinkUrl: string | null;
};

export const HOMEPAGE_CONFIG_SELECT =
  "research_label, research_url, banner_enabled, banner_title, banner_body, banner_image_url, banner_link_url";

type RawConfig = {
  readonly research_label: string;
  readonly research_url: string;
  readonly banner_enabled: boolean;
  readonly banner_title: string | null;
  readonly banner_body: string | null;
  readonly banner_image_url: string | null;
  readonly banner_link_url: string | null;
};

export type HomepageConfigUpdate = Partial<RawConfig>;

export type ConfigClient = Pick<DbClient, "from">;

type SingleResult = {
  readonly data: RawConfig | null;
  readonly error: { readonly message: string } | null;
};

type UpdateResult = {
  readonly data: readonly { readonly id: number }[] | null;
  readonly error: { readonly message: string } | null;
};

export const getHomepageConfig = async (client: ConfigClient): Promise<HomepageConfig> => {
  const result = await (client
    .from("homepage_config")
    .select(HOMEPAGE_CONFIG_SELECT)
    .eq("id", 1)
    .maybeSingle() as PromiseLike<SingleResult>);

  if (result.error) {
    throw new Error(`Failed to load homepage config: ${result.error.message}`);
  }
  if (!result.data) {
    throw new Error("homepage_config row is missing — apply migration 0007.");
  }

  const raw = result.data;
  return {
    researchLabel: raw.research_label,
    researchUrl: raw.research_url,
    bannerEnabled: raw.banner_enabled,
    bannerTitle: raw.banner_title,
    bannerBody: raw.banner_body,
    bannerImageUrl: raw.banner_image_url,
    bannerLinkUrl: raw.banner_link_url
  };
};

// `.select("id")` verifies a row was actually written — an RLS-blocked update
// still reports success with zero rows (PostgREST 204 gotcha).
export const updateHomepageConfig = async (
  client: ConfigClient,
  update: HomepageConfigUpdate
): Promise<void> => {
  if (Object.keys(update).length === 0) {
    return;
  }

  const result = await (client
    .from("homepage_config")
    .update(update)
    .eq("id", 1)
    .select("id") as unknown as PromiseLike<UpdateResult>);

  if (result.error) {
    throw new Error(`Failed to update homepage config: ${result.error.message}`);
  }
  if (!result.data || result.data.length === 0) {
    throw new Error("Homepage config update affected no rows.");
  }
};
