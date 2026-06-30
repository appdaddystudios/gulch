import { describe, expect, it } from "vitest";

import { CRAWLER_UA, extractOgImage, isInstagramPostUrl } from "../src/instagram";

describe("isInstagramPostUrl", () => {
  it("accepts instagram post, reel, and tv URLs on instagram.com subdomains", () => {
    expect(isInstagramPostUrl("https://www.instagram.com/p/ABC123/")).toBe(true);
    expect(isInstagramPostUrl("https://instagram.com/reel/ABC123?igsh=abc")).toBe(true);
    expect(isInstagramPostUrl("https://m.instagram.com/tv/ABC123/")).toBe(true);
  });

  it("rejects profiles, non-Instagram URLs, null, and lookalike domains", () => {
    expect(isInstagramPostUrl("https://www.instagram.com/gulch/")).toBe(false);
    expect(isInstagramPostUrl("https://example.com/p/ABC123")).toBe(false);
    expect(isInstagramPostUrl("https://evilinstagram.com/p/ABC123")).toBe(false);
    expect(isInstagramPostUrl("not a url")).toBe(false);
    expect(isInstagramPostUrl(null)).toBe(false);
  });
});

describe("extractOgImage", () => {
  it("exports the crawler user agent required by the Instagram og:image route", () => {
    expect(CRAWLER_UA).toBe("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)");
  });

  it("returns the og:image content URL", () => {
    expect(
      extractOgImage('<html><head><meta property="og:image" content="https://cdninstagram.com/image.jpg"></head></html>')
    ).toBe("https://cdninstagram.com/image.jpg");
    expect(extractOgImage("<meta name='description' content='ignored'><meta property='og:image' content='https://cdn.test/a.jpg'>")).toBe(
      "https://cdn.test/a.jpg"
    );
    expect(extractOgImage("<meta property=og:image content=https://cdn.test/b.jpg>")).toBe("https://cdn.test/b.jpg");
  });

  it("decodes escaped ampersands from the content URL", () => {
    expect(
      extractOgImage('<meta content="https://cdninstagram.com/image.jpg?stp=dst-jpg&amp;ccb=7-5" property="og:image">')
    ).toBe("https://cdninstagram.com/image.jpg?stp=dst-jpg&ccb=7-5");
  });

  it("returns null when og:image is absent or malformed", () => {
    expect(extractOgImage("<html><head></head><body></body></html>")).toBeNull();
    expect(extractOgImage('<meta property="og:image">')).toBeNull();
  });
});
