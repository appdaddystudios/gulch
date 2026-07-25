import type { DbClient } from "@gulch/db";
import { z } from "zod";

export type BannerAd =
  | {
      readonly kind: "image";
      readonly imageUrl: string;
      readonly linkUrl: string | null;
    }
  | {
      readonly kind: "text";
      readonly title: string;
      readonly body: string | null;
      readonly linkUrl: string | null;
    };

export type HomeConfig = {
  readonly researchLabel: string;
  readonly researchUrl: string;
  readonly bannerAd: BannerAd | null;
};

// Shipped fallbacks — identical to the pre-config hardcoded homepage, so a
// missing or unreachable config row is a visual no-op.
export const HOME_CONFIG_DEFAULTS: HomeConfig = {
  researchLabel: "Take the Survey",
  researchUrl: "https://www.gulchmagazine.com/research",
  bannerAd: null,
};

export const HOME_CONFIG_SELECT =
  "research_label, research_url, banner_enabled, banner_title, banner_body, banner_image_url, banner_link_url";

const rawConfigSchema = z.object({
  research_label: z.string(),
  research_url: z.string(),
  banner_enabled: z.boolean(),
  banner_title: z.string().nullable(),
  banner_body: z.string().nullable(),
  banner_image_url: z.string().nullable(),
  banner_link_url: z.string().nullable(),
});

type RawConfig = z.infer<typeof rawConfigSchema>;

// Image mode wins over text mode; the slot hides (null) when disabled or empty.
const resolveBannerAd = (raw: RawConfig): BannerAd | null => {
  if (!raw.banner_enabled) {
    return null;
  }
  if (raw.banner_image_url) {
    return {
      kind: "image",
      imageUrl: raw.banner_image_url,
      linkUrl: raw.banner_link_url,
    };
  }
  if (raw.banner_title) {
    return {
      kind: "text",
      title: raw.banner_title,
      body: raw.banner_body,
      linkUrl: raw.banner_link_url,
    };
  }
  return null;
};

export const toHomeConfig = (raw: RawConfig): HomeConfig => ({
  researchLabel: raw.research_label,
  researchUrl: raw.research_url,
  bannerAd: resolveBannerAd(raw),
});

// Fail-safe by design: a missing row, query error, or malformed payload falls
// back to the shipped defaults — remote config must never break Home.
export const getHomeConfig = async (client: DbClient): Promise<HomeConfig> => {
  try {
    const { data, error } = await client
      .from("homepage_config")
      .select(HOME_CONFIG_SELECT)
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) {
      return HOME_CONFIG_DEFAULTS;
    }

    const parsed = rawConfigSchema.safeParse(data);
    return parsed.success ? toHomeConfig(parsed.data) : HOME_CONFIG_DEFAULTS;
  } catch {
    return HOME_CONFIG_DEFAULTS;
  }
};
