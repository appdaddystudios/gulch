import { createHash } from "node:crypto";

import { CRAWLER_UA, extractOgImage, isInstagramPostUrl } from "./instagram";
import type { FetchLike } from "./webflow-client";

export type CoverResult =
  | { readonly status: "ok"; readonly bytes: Uint8Array; readonly contentType: string; readonly checksum: string }
  | { readonly status: "unavailable" }
  | { readonly status: "failed"; readonly reason: string };

export type FetchInstagramCoverDeps = {
  readonly fetch: FetchLike;
  readonly ua?: string;
  readonly maxBytes?: number;
};

const defaultMaxBytes = 5 * 1024 * 1024;

export async function fetchInstagramCover(
  postUrl: string | null,
  deps: FetchInstagramCoverDeps
): Promise<CoverResult> {
  if (postUrl === null || !isInstagramPostUrl(postUrl)) {
    return { status: "unavailable" };
  }

  try {
    const ua = deps.ua ?? CRAWLER_UA;
    const postResponse = await deps.fetch(postUrl, { headers: { "user-agent": ua } });
    if (!postResponse.ok) {
      return { status: "failed", reason: `Instagram post request failed with status ${postResponse.status}` };
    }

    const imageUrl = extractOgImage(await postResponse.text());
    if (imageUrl === null) {
      return { status: "unavailable" };
    }

    const imageResponse = await deps.fetch(imageUrl, { headers: { "user-agent": ua } });
    if (!imageResponse.ok) {
      return { status: "failed", reason: `Instagram image request failed with status ${imageResponse.status}` };
    }

    const contentType = imageResponse.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return { status: "failed", reason: `Instagram image content-type is not image/*: ${contentType}` };
    }

    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    const maxBytes = deps.maxBytes ?? defaultMaxBytes;
    if (bytes.byteLength > maxBytes) {
      return { status: "failed", reason: `Instagram image exceeds maxBytes (${bytes.byteLength} > ${maxBytes})` };
    }

    return {
      status: "ok",
      bytes,
      contentType,
      checksum: createHash("sha256").update(bytes).digest("hex")
    };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}
