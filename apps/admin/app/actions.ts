"use server";

import type { DbClient } from "@gulch/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  addToList,
  getFeaturedState,
  moveInList,
  removeFromList,
  setFeaturedOrganizers
} from "@/lib/featured";
import { getHomepageConfig, updateHomepageConfig, type HomepageConfigUpdate } from "@/lib/homeContent";
import { createServiceSupabase } from "@/lib/supabase";

export type ActionResult = {
  readonly ok: boolean;
  readonly error: string | null;
  readonly saved: boolean;
};

const OK: ActionResult = { ok: true, error: null, saved: true };

const fail = (error: unknown): ActionResult => ({
  ok: false,
  error: error instanceof Error ? error.message : "Unexpected error.",
  saved: false
});

const invalid = (message: string | undefined): ActionResult => ({
  ok: false,
  error: message ?? "Invalid input.",
  saved: false
});

const requireServiceClient = (): DbClient => {
  const client = createServiceSupabase();
  if (!client) {
    throw new Error("Admin write client unavailable — check SUPABASE_SERVICE_ROLE_KEY in apps/admin/.env.");
  }
  return client;
};

const httpUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL.")
  .refine((value) => /^https?:\/\//i.test(value), "URL must start with http:// or https://");

// --- Research button -------------------------------------------------------

const researchSchema = z.object({
  label: z.string().trim().min(1, "Label is required.").max(80, "Label must be 80 characters or fewer."),
  url: httpUrlSchema
});

export const saveResearch = async (_prev: ActionResult, formData: FormData): Promise<ActionResult> => {
  try {
    const parsed = researchSchema.safeParse({
      label: formData.get("label"),
      url: formData.get("url")
    });
    if (!parsed.success) {
      return invalid(parsed.error.issues[0]?.message);
    }

    await updateHomepageConfig(requireServiceClient(), {
      research_label: parsed.data.label,
      research_url: parsed.data.url
    });
    revalidatePath("/");
    return OK;
  } catch (error) {
    return fail(error);
  }
};

// --- Banner ad -------------------------------------------------------------

const emptyToNull = (value: string): string | null => (value === "" ? null : value);

const bannerSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().max(80, "Title must be 80 characters or fewer.").transform(emptyToNull),
  body: z.string().trim().max(200, "Body must be 200 characters or fewer.").transform(emptyToNull),
  linkUrl: z
    .union([z.literal(""), httpUrlSchema])
    .transform((value) => (value === "" ? null : value))
});

const BANNER_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const MAX_BANNER_IMAGE_BYTES = 5 * 1024 * 1024;

const uploadBannerImage = async (client: DbClient, file: File): Promise<string> => {
  const extension = BANNER_IMAGE_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error("Banner image must be a PNG, JPEG, WebP, or GIF.");
  }
  if (file.size > MAX_BANNER_IMAGE_BYTES) {
    throw new Error("Banner image must be 5 MB or smaller.");
  }

  // Timestamped path doubles as a cache-buster (same trick as event images).
  const path = `banner/${Date.now()}.${extension}`;
  const uploaded = await client.storage
    .from("banner-ads")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploaded.error) {
    throw new Error(`Failed to upload banner image: ${uploaded.error.message}`);
  }

  return client.storage.from("banner-ads").getPublicUrl(path).data.publicUrl;
};

const BANNER_BUCKET_MARKER = "/object/public/banner-ads/";

const bannerStoragePath = (publicUrl: string): string | null => {
  const index = publicUrl.indexOf(BANNER_BUCKET_MARKER);
  return index === -1 ? null : publicUrl.slice(index + BANNER_BUCKET_MARKER.length);
};

// Best-effort removal of a superseded banner object — replaced/removed
// creatives would otherwise accumulate in the public bucket forever. Runs
// after the config update succeeds and never fails the save.
const removeSupersededBannerImage = async (
  client: DbClient,
  previousUrl: string | null,
  nextUrl: string | null
): Promise<void> => {
  if (!previousUrl || previousUrl === nextUrl) {
    return;
  }
  const path = bannerStoragePath(previousUrl);
  if (!path) {
    return;
  }
  const removed = await client.storage.from("banner-ads").remove([path]);
  if (removed.error) {
    console.error("Failed to remove superseded banner image:", removed.error.message);
  }
};

export const saveBanner = async (_prev: ActionResult, formData: FormData): Promise<ActionResult> => {
  try {
    const parsed = bannerSchema.safeParse({
      enabled: formData.get("enabled") === "on",
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
      linkUrl: String(formData.get("linkUrl") ?? "")
    });
    if (!parsed.success) {
      return invalid(parsed.error.issues[0]?.message);
    }

    const client = requireServiceClient();
    const previous = await getHomepageConfig(client);

    // A new upload wins over the remove checkbox; neither leaves the image as is.
    const image = formData.get("image");
    const imageUpdate: HomepageConfigUpdate =
      image instanceof File && image.size > 0
        ? { banner_image_url: await uploadBannerImage(client, image) }
        : formData.get("removeImage") === "on"
          ? { banner_image_url: null }
          : {};

    await updateHomepageConfig(client, {
      banner_enabled: parsed.data.enabled,
      banner_title: parsed.data.title,
      banner_body: parsed.data.body,
      banner_link_url: parsed.data.linkUrl,
      ...imageUpdate
    });

    const nextImageUrl =
      "banner_image_url" in imageUpdate
        ? (imageUpdate.banner_image_url ?? null)
        : previous.bannerImageUrl;
    await removeSupersededBannerImage(client, previous.bannerImageUrl, nextImageUrl);
    revalidatePath("/");
    return OK;
  } catch (error) {
    return fail(error);
  }
};

// --- Featured organizations ------------------------------------------------

const featuredEditSchema = z.object({
  organizerId: z.string().trim().min(1, "Missing organizer id.")
});

const editFeatured = async (
  formData: FormData,
  edit: (ids: readonly string[], id: string) => readonly string[]
): Promise<ActionResult> => {
  try {
    const parsed = featuredEditSchema.safeParse({ organizerId: formData.get("organizerId") });
    if (!parsed.success) {
      return invalid(parsed.error.issues[0]?.message);
    }

    const client = requireServiceClient();
    const state = await getFeaturedState(client);
    const next = edit(state.featuredIds, parsed.data.organizerId);
    if (next !== state.featuredIds) {
      await setFeaturedOrganizers(client, next);
    }
    revalidatePath("/");
    return OK;
  } catch (error) {
    return fail(error);
  }
};

export const addFeaturedOrganizer = async (
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> => editFeatured(formData, addToList);

export const removeFeaturedOrganizer = async (
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> => editFeatured(formData, removeFromList);

export const moveFeaturedOrganizerUp = async (
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> => editFeatured(formData, (ids, id) => moveInList(ids, id, "up"));

export const moveFeaturedOrganizerDown = async (
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> => editFeatured(formData, (ids, id) => moveInList(ids, id, "down"));
