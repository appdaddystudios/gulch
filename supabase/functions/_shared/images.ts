// Deno port of packages/pipeline/src/{instagram,image-fetcher}.ts. Edge
// Functions bundle only files under supabase/functions, so the pure helpers
// are copied here; keep the two in step. Same storage path and same event
// columns as the scheduled images job, so either writer can run first.
import { createServiceClient, updateEventImage, type EventImageUpdate } from "./db.ts";
import type { FetchLike } from "./webflow.ts";

export const CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
export const IMAGE_BUCKET = "event-images";
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const instagramHostPattern = /(^|\.)instagram\.com$/i;
const postPathPattern = /^\/(?:p|reel|tv)\/[^/]+\/?$/;
const videoPathPattern = /\/(?:reel|tv)\//;
const metaTagPattern = /<meta\b[^>]*>/gi;
const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

export function isInstagramPostUrl(url: string | null): boolean {
  if (url === null) return false;
  try {
    const parsed = new URL(url);
    return instagramHostPattern.test(parsed.hostname) && postPathPattern.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function extractOgImage(html: string): string | null {
  return extractOgContent(html, "og:image");
}

// Instagram rewrites the canonical URL to /reel/ (or legacy /tv/) for video
// posts; it is the only video signal still served to anonymous crawlers.
export function extractOgUrl(html: string): string | null {
  return extractOgContent(html, "og:url");
}

export function isVideoCanonicalUrl(url: string | null): boolean {
  if (url === null) return false;
  try {
    const parsed = new URL(url);
    return instagramHostPattern.test(parsed.hostname) && videoPathPattern.test(parsed.pathname);
  } catch {
    return false;
  }
}

function extractOgContent(html: string, property: string): string | null {
  for (const [tag] of html.matchAll(metaTagPattern)) {
    const attributes = parseAttributes(tag);
    if (attributes.get("property") !== property) continue;
    const content = attributes.get("content");
    return content ? content.replaceAll("&amp;", "&") : null;
  }
  return null;
}

function parseAttributes(tag: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(attributePattern)) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    if (!name) continue;
    attributes.set(name.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted ?? "");
  }
  return attributes;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type CoverResult =
  | { status: "ok"; bytes: Uint8Array; contentType: string; checksum: string; isVideo: boolean }
  | { status: "unavailable" }
  | { status: "failed"; reason: string };

export type FetchCoverDeps = {
  fetch: FetchLike;
  ua?: string;
  maxBytes?: number;
};

export async function fetchInstagramCover(postUrl: string | null, deps: FetchCoverDeps): Promise<CoverResult> {
  if (postUrl === null || !isInstagramPostUrl(postUrl)) return { status: "unavailable" };

  try {
    const ua = deps.ua ?? CRAWLER_UA;
    const postResponse = await deps.fetch(postUrl, { headers: { "user-agent": ua } });
    if (!postResponse.ok) {
      return { status: "failed", reason: `Instagram post request failed with status ${postResponse.status}` };
    }

    const postHtml = await postResponse.text();
    const imageUrl = extractOgImage(postHtml);
    if (imageUrl === null) return { status: "unavailable" };
    const isVideo = isVideoCanonicalUrl(extractOgUrl(postHtml));

    const imageResponse = await deps.fetch(imageUrl, { headers: { "user-agent": ua } });
    if (!imageResponse.ok) {
      return { status: "failed", reason: `Instagram image request failed with status ${imageResponse.status}` };
    }

    const contentType = imageResponse.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return { status: "failed", reason: `Instagram image content-type is not image/*: ${contentType}` };
    }

    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
    if (bytes.byteLength > maxBytes) {
      return { status: "failed", reason: `Instagram image exceeds maxBytes (${bytes.byteLength} > ${maxBytes})` };
    }

    return { status: "ok", bytes, contentType, checksum: await sha256Hex(bytes), isVideo };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}

export type HeroImageDeps = {
  fetcher?: FetchLike;
  fetchCover?: (postUrl: string | null) => Promise<CoverResult>;
  upload?: (eventId: string, bytes: Uint8Array, contentType: string) => Promise<string>;
  updateEventImage?: (eventId: string, fields: EventImageUpdate) => Promise<void>;
  now?: () => string;
};

export type HeroImageOutcome = "ok" | "unavailable" | "failed";

async function defaultUpload(eventId: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const client = createServiceClient();
  const path = `events/${eventId}.jpg`;
  const result = await client.storage.from(IMAGE_BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (result.error) throw new Error(`Failed to upload event image ${eventId}: ${result.error.message}`);
  return client.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// One event, one attempt. The 6-hourly images job remains the retry path for
// anything that ends up "failed" here.
export async function fetchHeroImage(
  eventId: string,
  externalLink: string | null,
  deps: HeroImageDeps = {}
): Promise<HeroImageOutcome> {
  const fetcher = deps.fetcher ?? fetch;
  const fetchCover = deps.fetchCover ?? ((postUrl) => fetchInstagramCover(postUrl, { fetch: fetcher }));
  const upload = deps.upload ?? defaultUpload;
  const update = deps.updateEventImage ??
    ((id: string, fields: EventImageUpdate) => updateEventImage(createServiceClient(), id, fields));
  const fetchedAt = (deps.now ?? (() => new Date().toISOString()))();

  try {
    const result = await fetchCover(externalLink);
    if (result.status === "ok") {
      const publicUrl = await upload(eventId, result.bytes, result.contentType);
      await update(eventId, {
        image_url: `${publicUrl}?v=${result.checksum.slice(0, 8)}`,
        image_status: "ok",
        image_checksum: result.checksum,
        image_fetched_at: fetchedAt,
        is_video: result.isVideo
      });
      return "ok";
    }
    if (result.status === "unavailable") {
      await update(eventId, { image_url: null, image_status: "unavailable", image_fetched_at: fetchedAt });
      return "unavailable";
    }
    console.error(`Hero image fetch failed for ${eventId}: ${result.reason}`);
    await update(eventId, { image_status: "failed", image_fetched_at: fetchedAt });
    return "failed";
  } catch (error) {
    console.error(`Hero image processing failed for ${eventId}: ${error instanceof Error ? error.message : String(error)}`);
    await update(eventId, { image_status: "failed", image_fetched_at: fetchedAt });
    return "failed";
  }
}
