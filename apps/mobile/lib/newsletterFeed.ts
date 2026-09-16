import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

export type NewsletterPost = {
  readonly slug: string; // last path segment of link
  readonly title: string;
  readonly subtitle: string | null;
  readonly link: string; // canonical post URL
  readonly publishedAt: string; // ISO 8601
  readonly coverUrl: string | null;
  readonly previewHtml: string; // raw content:encoded, sanitized at render time
};

export type NewsletterPublication = {
  readonly title: string;
  readonly description: string | null;
  readonly link: string;
  readonly logoUrl: string | null;
};

export type NewsletterFeed = {
  readonly publication: NewsletterPublication;
  readonly posts: readonly NewsletterPost[];
  readonly fetchedAt: string;
};

export const NEWSLETTER_BASE_URL = "https://gulchmag.substack.com/";
export const NEWSLETTER_FEED_URL = "https://gulchmag.substack.com/feed";
export const NEWSLETTER_SUBSCRIBE_URL =
  "https://gulchmag.substack.com/subscribe";
export const NEWSLETTER_FEED_TTL_MS = 15 * 60 * 1000;

export class NewsletterFeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewsletterFeedError";
  }
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const codePointToString = (codePoint: number): string | null => {
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return null;
  }
};

// Substack wraps every text field in CDATA, so HTML entities (&#8217;) reach
// us verbatim and must be decoded before native rendering.
export const decodeHtmlEntities = (text: string): string =>
  text.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi,
    (match: string, hex?: string, decimal?: string, name?: string) => {
      if (hex) {
        return codePointToString(Number.parseInt(hex, 16)) ?? match;
      }
      if (decimal) {
        return codePointToString(Number(decimal)) ?? match;
      }
      return NAMED_ENTITIES[(name ?? "").toLowerCase()] ?? match;
    },
  );

// fast-xml-parser returns `{ "#text": "…", "@_attr": "…" }` for a text node
// that also carries attributes (e.g. `<guid isPermaLink="false">`).
const textNode = z.preprocess(
  (value) =>
    typeof value === "object" && value !== null && "#text" in value
      ? (value as { readonly "#text": unknown })["#text"]
      : value,
  z.string(),
);

const rawItemSchema = z.object({
  title: textNode,
  link: textNode,
  description: textNode.optional(),
  pubDate: textNode,
  enclosure: z.object({ "@_url": z.string() }).optional(),
  "content:encoded": textNode.optional(),
});

const rawChannelSchema = z.object({
  title: textNode,
  description: textNode.optional(),
  link: textNode,
  image: z.object({ url: textNode }).optional(),
  item: z.array(z.unknown()).optional(),
});

const rawFeedSchema = z.object({
  rss: z.object({ channel: rawChannelSchema }),
});

const postSchema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  subtitle: z.string().nullable(),
  link: z.string(),
  publishedAt: z.string(),
  coverUrl: z.string().nullable(),
  previewHtml: z.string(),
});

const feedSchema = z.object({
  publication: z.object({
    title: z.string(),
    description: z.string().nullable(),
    link: z.string(),
    logoUrl: z.string().nullable(),
  }),
  posts: z.array(postSchema),
  fetchedAt: z.string(),
});

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "item",
  // Keep "#42" and "0" as strings; nothing in the feed is numeric data.
  parseTagValue: false,
  parseAttributeValue: false,
});

export const slugFromLink = (link: string): string | null => {
  try {
    const segment = new URL(link).pathname.split("/").filter(Boolean).pop();
    return segment ?? null;
  } catch {
    return null;
  }
};

const cleanText = (text: string): string => decodeHtmlEntities(text).trim();

const toOptionalText = (text: string | undefined): string | null => {
  const cleaned = text ? cleanText(text) : "";
  return cleaned.length > 0 ? cleaned : null;
};

// Items missing a title/link, or carrying an unparseable date, are skipped —
// a shape change upstream shrinks the list rather than crashing the tab.
const toPost = (raw: unknown): NewsletterPost | null => {
  const item = rawItemSchema.safeParse(raw);
  if (!item.success) {
    return null;
  }

  const { title, link, description, pubDate, enclosure } = item.data;
  const slug = slugFromLink(link);
  const published = new Date(pubDate);
  const cleanTitle = cleanText(title);
  if (!slug || cleanTitle.length === 0 || Number.isNaN(published.getTime())) {
    return null;
  }

  return {
    slug,
    title: cleanTitle,
    subtitle: toOptionalText(description),
    link,
    publishedAt: published.toISOString(),
    coverUrl: enclosure?.["@_url"] ?? null,
    previewHtml: item.data["content:encoded"] ?? "",
  };
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const parseNewsletterFeed = (
  xml: string,
  now: Date = new Date(),
): NewsletterFeed => {
  let document: unknown;
  try {
    document = parser.parse(xml, true);
  } catch (error) {
    throw new NewsletterFeedError(
      `Feed is not well-formed XML: ${describeError(error)}`,
    );
  }

  const feed = rawFeedSchema.safeParse(document);
  if (!feed.success) {
    throw new NewsletterFeedError("Feed has no <rss><channel>");
  }

  const channel = feed.data.rss.channel;
  const posts = (channel.item ?? []).flatMap((raw) => {
    const post = toPost(raw);
    return post ? [post] : [];
  });

  return {
    publication: {
      title: cleanText(channel.title),
      description: toOptionalText(channel.description),
      link: channel.link,
      logoUrl: channel.image?.url ?? null,
    },
    posts,
    fetchedAt: now.toISOString(),
  };
};

export const fetchNewsletterFeed = async (
  fetchImpl: typeof fetch = fetch,
): Promise<NewsletterFeed> => {
  const response = await fetchImpl(NEWSLETTER_FEED_URL, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!response.ok) {
    throw new NewsletterFeedError(
      `Feed request failed with HTTP ${response.status}`,
    );
  }
  return parseNewsletterFeed(await response.text());
};

// Cached JSON is a trust boundary: an older app version or a corrupted write
// must degrade to "no cache", never to a crash.
export const parseCachedNewsletterFeed = (
  raw: string | null | undefined,
): NewsletterFeed | null => {
  if (!raw) {
    return null;
  }
  try {
    const result = feedSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const isNewsletterFeedFresh = (
  feed: NewsletterFeed,
  now: Date = new Date(),
  ttlMs: number = NEWSLETTER_FEED_TTL_MS,
): boolean => {
  const fetchedAt = new Date(feed.fetchedAt).getTime();
  return !Number.isNaN(fetchedAt) && now.getTime() - fetchedAt < ttlMs;
};
