import { describe, expect, it } from "vitest";

import { instagramEmbedUrl } from "./instagramEmbed";

describe("instagramEmbedUrl", () => {
  it("builds the embed URL from post, reel, and tv links", () => {
    expect(instagramEmbedUrl("https://www.instagram.com/p/DZrwvUGuaV0/")).toBe(
      "https://www.instagram.com/p/DZrwvUGuaV0/embed/",
    );
    expect(instagramEmbedUrl("https://instagram.com/reel/ABC123?igsh=xyz")).toBe(
      "https://www.instagram.com/p/ABC123/embed/",
    );
    expect(instagramEmbedUrl("https://m.instagram.com/tv/ABC123/")).toBe(
      "https://www.instagram.com/p/ABC123/embed/",
    );
  });

  it("handles profile-scoped canonical URLs", () => {
    expect(
      instagramEmbedUrl("https://www.instagram.com/gvgatl/reel/DZrwvUGuaV0/"),
    ).toBe("https://www.instagram.com/p/DZrwvUGuaV0/embed/");
  });

  it("returns null for profiles, other domains, null, and junk", () => {
    expect(instagramEmbedUrl("https://www.instagram.com/gulchmag/")).toBeNull();
    expect(instagramEmbedUrl("https://example.com/p/ABC123/")).toBeNull();
    expect(instagramEmbedUrl("https://evilinstagram.com/p/ABC123/")).toBeNull();
    expect(instagramEmbedUrl(null)).toBeNull();
    expect(instagramEmbedUrl("not a url")).toBeNull();
  });
});
