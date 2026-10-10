// Deno port of the pipeline image fetcher: must behave exactly like the Node
// version so the webhook and the 6-hourly job are interchangeable writers.
import {
  extractOgImage,
  extractOgUrl,
  fetchHeroImage,
  fetchInstagramCover,
  imageObjectPath,
  isInstagramPostUrl,
  isVideoCanonicalUrl,
  sha256Hex
} from "../_shared/images.ts";
import type { EventImageUpdate } from "../_shared/db.ts";
import { assertEquals } from "./helpers.ts";

const NOW = "2026-10-10T12:00:00.000Z";
const POST_URL = "https://www.instagram.com/p/abc123/";
const IMAGE_URL = "https://scontent.cdninstagram.com/v/t51/abc.jpg?a=1&amp;b=2";
const DECODED_IMAGE_URL = "https://scontent.cdninstagram.com/v/t51/abc.jpg?a=1&b=2";

const html = (ogUrl = POST_URL) =>
  `<html><head><meta property="og:url" content="${ogUrl}"><meta property='og:image' content='${IMAGE_URL}'></head></html>`;

function fakeFetch(responses: Record<string, Response>): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const key = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const response = responses[key];
    return Promise.resolve(response ?? new Response("missing", { status: 404 }));
  }) as typeof fetch;
}

const imageBytes = new Uint8Array([1, 2, 3, 4]);

Deno.test("instagram URL helpers match the pipeline rules", () => {
  assertEquals(isInstagramPostUrl(POST_URL), true);
  assertEquals(isInstagramPostUrl("https://instagram.com/reel/xyz"), true);
  assertEquals(isInstagramPostUrl("https://www.instagram.com/someuser/"), false);
  assertEquals(isInstagramPostUrl("not a url"), false);
  assertEquals(isInstagramPostUrl(null), false);
  assertEquals(isVideoCanonicalUrl("https://www.instagram.com/reel/xyz/"), true);
  assertEquals(isVideoCanonicalUrl(POST_URL), false);
});

Deno.test("og tags are parsed from either quote style and HTML-decoded", () => {
  assertEquals(extractOgImage(html()), DECODED_IMAGE_URL);
  assertEquals(extractOgUrl(html()), POST_URL);
  assertEquals(extractOgImage("<html><head></head></html>"), null);
});

Deno.test("sha256Hex matches the well-known digest", async () => {
  assertEquals(
    await sha256Hex(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

Deno.test("fetchInstagramCover returns bytes, content type, checksum and video flag", async () => {
  const result = await fetchInstagramCover(POST_URL, {
    fetch: fakeFetch({
      [POST_URL]: new Response(html("https://www.instagram.com/reel/abc123/")),
      [DECODED_IMAGE_URL]: new Response(imageBytes, { headers: { "content-type": "image/jpeg" } })
    })
  });

  assertEquals(result.status, "ok");
  if (result.status !== "ok") return;
  assertEquals(result.contentType, "image/jpeg");
  assertEquals(result.isVideo, true);
  assertEquals(result.checksum, await sha256Hex(imageBytes));
  assertEquals(Array.from(result.bytes), [1, 2, 3, 4]);
});

Deno.test("fetchInstagramCover classifies non-post links, missing og:image, bad content type and oversize", async () => {
  assertEquals(await fetchInstagramCover("https://example.com/", { fetch: fakeFetch({}) }), { status: "unavailable" });
  assertEquals(
    await fetchInstagramCover(POST_URL, { fetch: fakeFetch({ [POST_URL]: new Response("<html></html>") }) }),
    { status: "unavailable" }
  );

  const notImage = await fetchInstagramCover(POST_URL, {
    fetch: fakeFetch({
      [POST_URL]: new Response(html()),
      [DECODED_IMAGE_URL]: new Response("nope", { headers: { "content-type": "text/html" } })
    })
  });
  assertEquals(notImage.status, "failed");

  const tooBig = await fetchInstagramCover(POST_URL, {
    maxBytes: 2,
    fetch: fakeFetch({
      [POST_URL]: new Response(html()),
      [DECODED_IMAGE_URL]: new Response(imageBytes, { headers: { "content-type": "image/jpeg" } })
    })
  });
  assertEquals(tooBig.status, "failed");

  const postDown = await fetchInstagramCover(POST_URL, {
    fetch: fakeFetch({ [POST_URL]: new Response("", { status: 503 }) })
  });
  assertEquals(postDown.status, "failed");
});

Deno.test("imageObjectPath is content-addressed so overlapping workers never clobber each other", () => {
  assertEquals(imageObjectPath("event-1", "abcdef0123456789"), "events/event-1-abcdef01.jpg");
});

Deno.test("fetchHeroImage writes the same columns as the pipeline, guarded by the link it fetched for", async () => {
  const updates: { eventId: string; fields: EventImageUpdate; expectedLink: string | null }[] = [];
  const uploads: { eventId: string; contentType: string; checksum: string }[] = [];

  const outcome = await fetchHeroImage("event-1", POST_URL, {
    fetchCover: async () => ({ status: "ok", bytes: imageBytes, contentType: "image/jpeg", checksum: "abcdef0123456789", isVideo: false }),
    upload: async (eventId, _bytes, contentType, checksum) => {
      uploads.push({ eventId, contentType, checksum });
      return `https://cdn.example/event-images/${imageObjectPath(eventId, checksum)}`;
    },
    updateEventImage: async (eventId, fields, expectedLink) => {
      updates.push({ eventId, fields, expectedLink });
      return true;
    },
    now: () => NOW
  });

  assertEquals(outcome, "ok");
  assertEquals(uploads, [{ eventId: "event-1", contentType: "image/jpeg", checksum: "abcdef0123456789" }]);
  assertEquals(updates, [{
    eventId: "event-1",
    fields: {
      image_url: "https://cdn.example/event-images/events/event-1-abcdef01.jpg?v=abcdef01",
      image_status: "ok",
      image_checksum: "abcdef0123456789",
      image_fetched_at: NOW,
      is_video: false
    },
    expectedLink: POST_URL
  }]);
});

// Two workers for one event (overlapping publishes, or webhook + images job)
// may finish in either order; the one whose link is no longer current must
// not win. The guarded update returns false, and the result is dropped.
Deno.test("fetchHeroImage drops its result when the event's link changed while it was fetching", async () => {
  const update = async () => false;
  const upload = async () => "https://cdn.example/event-images/events/e-x.jpg";

  assertEquals(
    await fetchHeroImage("e", POST_URL, {
      fetchCover: async () => ({ status: "ok", bytes: imageBytes, contentType: "image/jpeg", checksum: "x", isVideo: false }),
      upload,
      updateEventImage: update,
      now: () => NOW
    }),
    "stale"
  );
  assertEquals(
    await fetchHeroImage("e", null, { fetchCover: async () => ({ status: "unavailable" }), updateEventImage: update, now: () => NOW }),
    "stale"
  );
  assertEquals(
    await fetchHeroImage("e", POST_URL, {
      fetchCover: async () => ({ status: "failed", reason: "blocked" }),
      updateEventImage: update,
      now: () => NOW
    }),
    "stale"
  );
});

Deno.test("fetchHeroImage marks unavailable and failed, including when the upload throws", async () => {
  const updates: EventImageUpdate[] = [];
  const update = async (_id: string, fields: EventImageUpdate) => {
    updates.push(fields);
    return true;
  };

  assertEquals(
    await fetchHeroImage("e", null, { fetchCover: async () => ({ status: "unavailable" }), updateEventImage: update, now: () => NOW }),
    "unavailable"
  );
  assertEquals(
    await fetchHeroImage("e", POST_URL, {
      fetchCover: async () => ({ status: "failed", reason: "blocked" }),
      updateEventImage: update,
      now: () => NOW
    }),
    "failed"
  );
  assertEquals(
    await fetchHeroImage("e", POST_URL, {
      fetchCover: async () => ({ status: "ok", bytes: imageBytes, contentType: "image/jpeg", checksum: "x", isVideo: false }),
      upload: async () => { throw new Error("storage down"); },
      updateEventImage: update,
      now: () => NOW
    }),
    "failed"
  );

  assertEquals(updates, [
    { image_url: null, image_status: "unavailable", image_fetched_at: NOW },
    { image_status: "failed", image_fetched_at: NOW },
    { image_status: "failed", image_fetched_at: NOW }
  ]);
});
