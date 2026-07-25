import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { fetchInstagramCover } from "../src/image-fetcher";
import { CRAWLER_UA } from "../src/instagram";
import type { FetchLike } from "../src/webflow-client";

const htmlResponse = (html: string, status = 200): Response =>
  new Response(html, {
    status,
    headers: { "content-type": "text/html" }
  });

const imageResponse = (body: Uint8Array, contentType = "image/jpeg", status = 200): Response =>
  new Response(body.buffer as ArrayBuffer, {
    status,
    headers: { "content-type": contentType }
  });

describe("fetchInstagramCover", () => {
  it("fetches the post og:image, verifies image bytes, and returns a sha256 checksum", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const calls: { readonly url: string; readonly ua: string | undefined }[] = [];
    const fetch: FetchLike = async (input, init) => {
      calls.push({
        url: String(input),
        ua: init?.headers instanceof Headers ? init.headers.get("user-agent") ?? undefined : (init?.headers as Record<string, string> | undefined)?.["user-agent"]
      });
      return calls.length === 1
        ? htmlResponse('<meta property="og:image" content="https://cdninstagram.com/image.jpg">')
        : imageResponse(bytes);
    };

    await expect(fetchInstagramCover("https://www.instagram.com/p/ABC123/", { fetch })).resolves.toEqual({
      status: "ok",
      bytes,
      contentType: "image/jpeg",
      checksum: createHash("sha256").update(bytes).digest("hex"),
      isVideo: false
    });
    expect(calls).toEqual([
      { url: "https://www.instagram.com/p/ABC123/", ua: CRAWLER_UA },
      { url: "https://cdninstagram.com/image.jpg", ua: CRAWLER_UA }
    ]);
  });

  it("flags video posts via the canonical og:url", async () => {
    const bytes = new Uint8Array([9, 9]);
    const fetch: FetchLike = async (input) =>
      String(input).includes("cdninstagram")
        ? imageResponse(bytes)
        : htmlResponse(
            '<meta property="og:image" content="https://cdninstagram.com/thumb.jpg" />' +
              '<meta property="og:url" content="https://www.instagram.com/gvgatl/reel/DZrwvUGuaV0/" />'
          );

    await expect(fetchInstagramCover("https://www.instagram.com/p/DZrwvUGuaV0/", { fetch })).resolves.toMatchObject({
      status: "ok",
      isVideo: true
    });
  });

  it("returns unavailable for non-Instagram URLs and posts without og:image", async () => {
    const fetch: FetchLike = async () => htmlResponse("<html></html>");

    await expect(fetchInstagramCover("https://example.com/event", { fetch })).resolves.toEqual({
      status: "unavailable"
    });
    await expect(fetchInstagramCover("https://instagram.com/p/ABC123", { fetch })).resolves.toEqual({
      status: "unavailable"
    });
  });

  it("returns failed for post and image HTTP failures", async () => {
    await expect(
      fetchInstagramCover("https://instagram.com/p/ABC123", {
        fetch: async () => htmlResponse("nope", 500)
      })
    ).resolves.toMatchObject({ status: "failed", reason: expect.stringContaining("post") });

    await expect(
      fetchInstagramCover("https://instagram.com/p/ABC123", {
        fetch: async (_input) =>
          String(_input).includes("cdninstagram")
            ? imageResponse(new Uint8Array(), "image/jpeg", 403)
            : htmlResponse('<meta property="og:image" content="https://cdninstagram.com/image.jpg">')
      })
    ).resolves.toMatchObject({ status: "failed", reason: expect.stringContaining("image") });
  });

  it("returns failed for non-image content types and oversized responses", async () => {
    await expect(
      fetchInstagramCover("https://instagram.com/p/ABC123", {
        fetch: async (input) =>
          String(input).includes("cdninstagram")
            ? imageResponse(new Uint8Array([1]), "text/html")
            : htmlResponse('<meta property="og:image" content="https://cdninstagram.com/image.jpg">')
      })
    ).resolves.toMatchObject({ status: "failed", reason: expect.stringContaining("content-type") });

    await expect(
      fetchInstagramCover("https://instagram.com/p/ABC123", {
        maxBytes: 2,
        fetch: async (input) =>
          String(input).includes("cdninstagram")
            ? imageResponse(new Uint8Array([1, 2, 3]), "image/jpeg")
            : htmlResponse('<meta property="og:image" content="https://cdninstagram.com/image.jpg">')
      })
    ).resolves.toMatchObject({ status: "failed", reason: expect.stringContaining("exceeds") });
  });

  it("never throws on network errors", async () => {
    await expect(
      fetchInstagramCover("https://instagram.com/p/ABC123", {
        fetch: async () => {
          throw new Error("socket closed");
        }
      })
    ).resolves.toEqual({ status: "failed", reason: "socket closed" });
  });
});
