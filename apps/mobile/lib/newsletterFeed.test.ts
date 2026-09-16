import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodeHtmlEntities,
  fetchNewsletterFeed,
  isNewsletterFeedFresh,
  NEWSLETTER_FEED_URL,
  NewsletterFeedError,
  parseCachedNewsletterFeed,
  parseNewsletterFeed,
  slugFromLink,
  type NewsletterFeed,
} from "./newsletterFeed";

const FIXTURE = readFileSync(
  new URL("./__fixtures__/substack-feed.xml", import.meta.url),
  "utf8",
);
const NOW = new Date("2026-09-16T12:00:00Z");

const wrapItems = (items: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>T</title><link>https://gulchmag.substack.com</link>${items}</channel></rss>`;

const okResponse = (body: string): Response =>
  new Response(body, { status: 200 });

describe("parseNewsletterFeed", () => {
  const feed = parseNewsletterFeed(FIXTURE, NOW);

  it("parses the publication block", () => {
    expect(feed.publication).toEqual({
      title: "GULCH Mag",
      description:
        "A print magazine archiving Atlanta visual arts & subcultures 🎨👽📗",
      link: "https://gulchmag.substack.com",
      logoUrl: expect.stringMatching(/^https:\/\/substackcdn\.com\//),
    });
    expect(feed.fetchedAt).toBe(NOW.toISOString());
  });

  it("skips the item with a malformed pubDate and keeps the rest", () => {
    expect(feed.posts.map((post) => post.slug)).toEqual([
      "five-days-left-submit-october-events",
      "gulchs-october-art-directory-submit",
    ]);
  });

  it("maps a full item to a post with ISO date and cover", () => {
    const [first] = feed.posts;
    expect(first).toMatchObject({
      slug: "five-days-left-submit-october-events",
      title: "Five days left: Submit October events",
      subtitle: "GULCH’s printed visual art Directory coming soon",
      link: "https://gulchmag.substack.com/p/five-days-left-submit-october-events",
      publishedAt: "2026-09-15T11:46:38.000Z",
      coverUrl:
        "https://substack-post-media.s3.amazonaws.com/public/images/6ceb9d40-d182-4fb1-9379-03b3e4d98fbb_4608x2505.png",
    });
    expect(first?.previewHtml).toContain("<button");
    expect(first?.previewHtml).toContain("<figure>");
  });

  it("leaves coverUrl null when the item has no enclosure", () => {
    expect(feed.posts[1]?.coverUrl).toBeNull();
    expect(feed.posts[1]?.subtitle).toBe(
      "Atlanta's art calendar finally appears in print ✌️👽",
    );
  });

  it("skips items missing a link, title, or slug", () => {
    const xml = wrapItems(
      `<item><title>No link</title><pubDate>Tue, 15 Sep 2026 11:46:38 GMT</pubDate></item>` +
        `<item><link>https://gulchmag.substack.com/p/no-title</link><pubDate>Tue, 15 Sep 2026 11:46:38 GMT</pubDate></item>` +
        `<item><title>Blank title</title><link>https://gulchmag.substack.com/p/blank</link><pubDate>Tue, 15 Sep 2026 11:46:38 GMT</pubDate><description></description></item>` +
        `<item><title>Root link</title><link>https://gulchmag.substack.com/</link><pubDate>Tue, 15 Sep 2026 11:46:38 GMT</pubDate></item>` +
        `<item><title>Kept</title><link>https://gulchmag.substack.com/p/kept</link><pubDate>Tue, 15 Sep 2026 11:46:38 GMT</pubDate></item>`,
    );
    const parsed = parseNewsletterFeed(xml, NOW);
    expect(parsed.posts.map((post) => post.slug)).toEqual(["blank", "kept"]);
    expect(parsed.posts[0]?.subtitle).toBeNull();
    expect(parsed.posts[1]?.previewHtml).toBe("");
    expect(parsed.publication.description).toBeNull();
    expect(parsed.publication.logoUrl).toBeNull();
  });

  it("unwraps text nodes that carry attributes", () => {
    const xml = wrapItems(
      `<item><title lang="en">Attr title</title><link>https://gulchmag.substack.com/p/attr</link><pubDate>Tue, 15 Sep 2026 11:46:38 GMT</pubDate></item>`,
    );
    expect(parseNewsletterFeed(xml, NOW).posts[0]?.title).toBe("Attr title");
  });

  it("returns zero posts for an empty channel", () => {
    expect(parseNewsletterFeed(wrapItems(""), NOW).posts).toEqual([]);
  });

  it("throws NewsletterFeedError for malformed XML", () => {
    expect(() => parseNewsletterFeed("<rss><channel>", NOW)).toThrow(
      NewsletterFeedError,
    );
    expect(() => parseNewsletterFeed("", NOW)).toThrow(NewsletterFeedError);
  });

  it("throws NewsletterFeedError when there is no rss channel", () => {
    expect(() =>
      parseNewsletterFeed("<feed><entry>x</entry></feed>", NOW),
    ).toThrow(/no <rss><channel>/);
  });

  it("defaults fetchedAt to now", () => {
    const before = Date.now();
    const parsed = parseNewsletterFeed(wrapItems(""));
    expect(new Date(parsed.fetchedAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("slugFromLink", () => {
  it("returns the last path segment", () => {
    expect(slugFromLink("https://gulchmag.substack.com/p/issue-42")).toBe(
      "issue-42",
    );
    expect(slugFromLink("https://gulchmag.substack.com/p/issue-42/")).toBe(
      "issue-42",
    );
  });

  it("returns null for the root path or an invalid URL", () => {
    expect(slugFromLink("https://gulchmag.substack.com/")).toBeNull();
    expect(slugFromLink("not a url")).toBeNull();
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes numeric, hex, and named entities", () => {
    expect(decodeHtmlEntities("GULCH&#8217;s &amp; &#x1F3A8; &quot;x&quot;")).toBe(
      "GULCH’s & 🎨 \"x\"",
    );
  });

  it("leaves unknown or invalid entities untouched", () => {
    expect(decodeHtmlEntities("&bogus; &#99999999; plain")).toBe(
      "&bogus; &#99999999; plain",
    );
  });
});

describe("fetchNewsletterFeed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the feed URL with the injected fetch and parses it", async () => {
    const fetchImpl = vi.fn(async () => okResponse(FIXTURE));

    const feed = await fetchNewsletterFeed(fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledWith(
      NEWSLETTER_FEED_URL,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(feed.posts).toHaveLength(2);
  });

  it("rejects with NewsletterFeedError on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));

    await expect(
      fetchNewsletterFeed(fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("propagates network failures from fetch", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Network request failed");
    });

    await expect(
      fetchNewsletterFeed(fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow("Network request failed");
  });

  it("uses the global fetch by default", async () => {
    const globalFetch = vi.fn(async () => okResponse(FIXTURE));
    vi.stubGlobal("fetch", globalFetch);

    await fetchNewsletterFeed();

    expect(globalFetch).toHaveBeenCalledTimes(1);
  });
});

describe("parseCachedNewsletterFeed", () => {
  const feed = parseNewsletterFeed(FIXTURE, NOW);

  it("round-trips a serialized feed", () => {
    expect(parseCachedNewsletterFeed(JSON.stringify(feed))).toEqual(feed);
  });

  it("returns null for empty, invalid JSON, or wrong shape", () => {
    expect(parseCachedNewsletterFeed(null)).toBeNull();
    expect(parseCachedNewsletterFeed(undefined)).toBeNull();
    expect(parseCachedNewsletterFeed("")).toBeNull();
    expect(parseCachedNewsletterFeed("{not json")).toBeNull();
    expect(parseCachedNewsletterFeed('{"posts":[]}')).toBeNull();
  });
});

describe("isNewsletterFeedFresh", () => {
  const at = (fetchedAt: string): NewsletterFeed => ({
    publication: { title: "T", description: null, link: "x", logoUrl: null },
    posts: [],
    fetchedAt,
  });

  it("is fresh inside the TTL and stale after it", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    expect(isNewsletterFeedFresh(at("2026-09-16T11:50:00Z"), now)).toBe(true);
    expect(isNewsletterFeedFresh(at("2026-09-16T11:44:59Z"), now)).toBe(false);
    expect(isNewsletterFeedFresh(at("2026-09-16T11:59:00Z"), now, 30_000)).toBe(
      false,
    );
  });

  it("treats an unparseable fetchedAt as stale", () => {
    expect(isNewsletterFeedFresh(at("garbage"), NOW)).toBe(false);
  });

  it("defaults now to the current time", () => {
    expect(isNewsletterFeedFresh(at(new Date().toISOString()))).toBe(true);
  });
});
