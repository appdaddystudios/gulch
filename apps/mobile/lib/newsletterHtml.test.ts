import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseNewsletterFeed, type NewsletterPost } from "./newsletterFeed";
import {
  buildPostDocument,
  isSameDocumentUrl,
  shouldAllowDocumentLoad,
  sanitizePreviewHtml,
} from "./newsletterHtml";

const FIXTURE = readFileSync(
  new URL("./__fixtures__/substack-feed.xml", import.meta.url),
  "utf8",
);

const post = (overrides: Partial<NewsletterPost> = {}): NewsletterPost => ({
  slug: "issue-1",
  title: "Issue <1> & \"Friends\"",
  subtitle: "It's a subtitle",
  link: "https://gulchmag.substack.com/p/issue-1",
  publishedAt: "2026-05-07T12:00:00.000Z",
  coverUrl: null,
  previewHtml: "<p>Hello</p>",
  ...overrides,
});

describe("sanitizePreviewHtml", () => {
  it("strips script, style, iframe, form, button, and svg blocks with content", () => {
    const html =
      '<p>keep</p><script>alert(1)</script><STYLE>p{}</STYLE><iframe src="https://x"></iframe>' +
      '<form action="/x"><input></form><button><svg><path d="M0"/></svg></button><svg><g/></svg><p>end</p>';

    expect(sanitizePreviewHtml(html)).toBe("<p>keep</p><p>end</p>");
  });

  it("removes stray and self-closing tags of stripped elements", () => {
    expect(sanitizePreviewHtml('<p>a</p><button class="x"><p>b</p>')).toBe(
      "<p>a</p><p>b</p>",
    );
    expect(sanitizePreviewHtml('<p>a</p><iframe src="x"/><p>b</p>')).toBe(
      "<p>a</p><p>b</p>",
    );
  });

  it("drops inline event handlers and javascript: URLs", () => {
    const html =
      "<a href=\"javascript:alert(1)\" onclick='go()'>x</a><img src=javascript:bad onerror=\"x()\" onLoad=\"y()\"><a href='javascript:z'>y</a>";

    expect(sanitizePreviewHtml(html)).toBe("<a>x</a><img><a>y</a>");
  });

  it("keeps paragraphs, images, figures, and links", () => {
    const html =
      '<figure><img src="https://cdn/x.jpg" alt=""><figcaption>c</figcaption></figure><p><a href="https://gulchmag.substack.com/p/x">Read more</a></p>';

    expect(sanitizePreviewHtml(html)).toBe(html);
  });

  it("forces http image sources (and srcset) to https", () => {
    const html =
      '<img src="http://cdn/x.jpg"><picture><source srcset="http://cdn/a.webp 1x, http://cdn/b.webp 2x"></picture><a href="http://example.com">no change</a>';

    expect(sanitizePreviewHtml(html)).toBe(
      '<img src="https://cdn/x.jpg"><picture><source srcset="https://cdn/a.webp 1x, https://cdn/b.webp 2x"></picture><a href="http://example.com">no change</a>',
    );
  });

  it("cleans the real Substack preview without losing its content", () => {
    const [first] = parseNewsletterFeed(FIXTURE).posts;
    const cleaned = sanitizePreviewHtml(first?.previewHtml ?? "");

    expect(first?.previewHtml).toMatch(/<button/i);
    expect(first?.previewHtml).toMatch(/<svg/i);
    expect(cleaned).not.toMatch(/<button|<svg|<path|<script/i);
    expect(cleaned).toContain("<figure>");
    expect(cleaned).toContain("<img");
    expect(cleaned).toContain("submit your October events");
  });
});

describe("buildPostDocument", () => {
  const html = buildPostDocument(post({ previewHtml: "<p>Body</p><script>x</script>" }), {
    dateLabel: "May 7, 2026",
  });

  it("is a full document with viewport meta and CSP", () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain("Content-Security-Policy");
  });

  it("renders the escaped title, subtitle, and date", () => {
    expect(html).toContain("<h1>Issue &lt;1&gt; &amp; &quot;Friends&quot;</h1>");
    expect(html).toContain('<p class="subtitle">It&#39;s a subtitle</p>');
    expect(html).toContain('<p class="date">May 7, 2026</p>');
    expect(html).not.toContain("<1>");
  });

  it("omits the subtitle paragraph when there is none", () => {
    const noSubtitle = buildPostDocument(post({ subtitle: null }), {
      dateLabel: "May 7, 2026",
    });
    expect(noSubtitle).not.toContain('class="subtitle"');
  });

  it("embeds the sanitized body and the footer padding rule", () => {
    expect(html).toContain("<article><p>Body</p></article>");
    expect(html).not.toContain("<script>");
    expect(html).toMatch(/padding:\s*16px 16px 120px/);
    expect(html).toContain("background: #291407");
  });
});

describe("isSameDocumentUrl", () => {
  it("allows about:blank and the base URL", () => {
    expect(isSameDocumentUrl("about:blank")).toBe(true);
    expect(isSameDocumentUrl("https://gulchmag.substack.com")).toBe(true);
    expect(isSameDocumentUrl("https://gulchmag.substack.com/")).toBe(true);
    expect(isSameDocumentUrl("https://gulchmag.substack.com/#top")).toBe(true);
  });

  it("intercepts every other navigation", () => {
    expect(isSameDocumentUrl("https://gulchmag.substack.com/p/issue-1")).toBe(false);
    expect(isSameDocumentUrl("https://gulchmag.substack.com/?utm=x")).toBe(false);
    expect(isSameDocumentUrl("https://substack.com/")).toBe(false);
    expect(isSameDocumentUrl("http://gulchmag.substack.com/")).toBe(false);
    expect(isSameDocumentUrl("not a url")).toBe(false);
  });
});

describe("shouldAllowDocumentLoad", () => {
  it("allows the document's own URL only before the first load completes", () => {
    expect(shouldAllowDocumentLoad("about:blank", false)).toBe(true);
    expect(shouldAllowDocumentLoad("https://gulchmag.substack.com/", false)).toBe(true);
  });

  it("intercepts a publication-root link once the page is on screen", () => {
    expect(shouldAllowDocumentLoad("https://gulchmag.substack.com/", true)).toBe(false);
    expect(shouldAllowDocumentLoad("https://gulchmag.substack.com", true)).toBe(false);
    expect(shouldAllowDocumentLoad("about:blank", true)).toBe(false);
  });

  it("never allows an external URL", () => {
    expect(shouldAllowDocumentLoad("https://gulchmag.substack.com/p/issue-1", false)).toBe(false);
    expect(shouldAllowDocumentLoad("https://substack.com/", true)).toBe(false);
  });
});
