export const CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const instagramHostPattern = /(^|\.)instagram\.com$/i;
const postPathPattern = /^\/(?:p|reel|tv)\/[^/]+\/?$/;
const metaTagPattern = /<meta\b[^>]*>/gi;
const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

export function isInstagramPostUrl(url: string | null): boolean {
  if (url === null) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return instagramHostPattern.test(parsed.hostname) && postPathPattern.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function extractOgImage(html: string): string | null {
  for (const [tag] of html.matchAll(metaTagPattern)) {
    const attributes = parseAttributes(tag);
    if (attributes.get("property") !== "og:image") {
      continue;
    }

    const content = attributes.get("content");
    return content ? decodeHtmlUrl(content) : null;
  }

  return null;
}

function parseAttributes(tag: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();

  for (const match of tag.matchAll(attributePattern)) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    if (!name) {
      continue;
    }

    attributes.set(name.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted ?? "");
  }

  return attributes;
}

function decodeHtmlUrl(value: string): string {
  return value.replaceAll("&amp;", "&");
}
