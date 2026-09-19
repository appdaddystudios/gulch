import { NEWSLETTER_BASE_URL, type NewsletterPost } from "./newsletterFeed";
import { color } from "../theme";

// Elements removed together with their content. JavaScript is off in the
// WebView, so this is defence in depth plus layout cleanup (Substack's
// image-zoom `<button><svg>` chrome).
const STRIPPED_ELEMENTS = [
  "script",
  "style",
  "iframe",
  "form",
  "button",
  "svg",
  "object",
  "embed",
  "noscript",
] as const;

const ELEMENT_PATTERNS: readonly RegExp[] = STRIPPED_ELEMENTS.map(
  (tag) => new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"),
);
// Whatever the block patterns left behind: self-closing or unbalanced tags.
const STRAY_TAG_PATTERN = new RegExp(
  `<\\/?(?:${STRIPPED_ELEMENTS.join("|")})\\b[^>]*>`,
  "gi",
);
// Substack's call-to-action button blocks (`<p class="button-wrapper"><a
// class="button …"><span>Label</span></a></p>`, nearly all pointing at
// /subscribe) and the "Read more" teaser it appends to a truncated post
// (`<p>\n <a href="…/p/slug">\n Read more\n </a>\n </p>` as the final
// paragraph, linking to the post itself). Neither belongs in the app: it
// renders prose and images only. The teaser match requires a link into the
// publication's post path so an editor's own closing "Read more" link to
// anywhere else survives.
const CTA_BLOCK_PATTERN =
  /<p\b[^>]*\bclass\s*=\s*"[^"]*\bbutton-wrapper\b[^"]*"[^>]*>[\s\S]*?<\/p>/gi;
const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const READ_MORE_TAIL_PATTERN = new RegExp(
  `<p>\\s*<a\\b[^>]*\\bhref\\s*=\\s*"${escapeRegExp(NEWSLETTER_BASE_URL)}p/[^"]*"[^>]*>\\s*Read more\\s*<\\/a>\\s*<\\/p>\\s*$`,
  "i",
);
const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_URL_ATTR =
  /\s+(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi;
const MEDIA_TAG = /<(?:img|source)\b[^>]*>/gi;
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const sanitizePreviewHtml = (html: string): string =>
  ELEMENT_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, ""), html)
    .replace(STRAY_TAG_PATTERN, "")
    .replace(CTA_BLOCK_PATTERN, "")
    .replace(READ_MORE_TAIL_PATTERN, "")
    .replace(EVENT_HANDLER_ATTR, "")
    .replace(SCRIPT_URL_ATTR, "")
    // Mixed content: every image request must be https (also covers srcset).
    .replace(MEDIA_TAG, (tag) => tag.replace(/http:\/\//gi, "https://"));

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

// Bottom padding keeps the last line of the preview above the native sticky
// footer.
const DOCUMENT_CSS = `
:root { color-scheme: dark; }
body {
  margin: 0;
  padding: 16px 16px 120px;
  background: ${color.oreo};
  color: ${color.khakis};
  font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-text-size-adjust: 100%;
  overflow-wrap: break-word;
}
a { color: ${color.gulchGreen}; }
h1 { margin: 0 0 8px; font-size: 26px; line-height: 1.2; color: ${color.white}; }
.subtitle { margin: 0 0 8px; font-size: 18px; }
.date { margin: 0 0 24px; font-size: 14px; color: ${color.brown300}; }
img { max-width: 100%; height: auto; border-radius: 8px; }
figure { margin: 16px 0; }
figcaption { font-size: 13px; color: ${color.brown300}; }
hr { margin: 24px 0; border: 0; border-top: 1px solid ${color.brown400}; }
blockquote, .pullquote { margin: 16px 0; padding-left: 12px; border-left: 3px solid ${color.gulchGreen}; }
pre { overflow-x: auto; }
`;

// A full document we own: the only web content the Newsletter surface ever
// loads. The CSP is a second guard behind javaScriptEnabled={false}.
export const buildPostDocument = (
  post: NewsletterPost,
  { dateLabel }: { readonly dateLabel: string },
): string => {
  const subtitle = post.subtitle
    ? `<p class="subtitle">${escapeHtml(post.subtitle)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'">
<title>${escapeHtml(post.title)}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
<header>
<h1>${escapeHtml(post.title)}</h1>
${subtitle}
<p class="date">${escapeHtml(dateLabel)}</p>
</header>
<article>${sanitizePreviewHtml(post.previewHtml)}</article>
</body>
</html>`;
};

// The initial document load arrives as about:blank or the baseUrl (with or
// without a trailing slash / fragment); anything else is a navigation away.
export const isSameDocumentUrl = (url: string): boolean => {
  if (url.startsWith("about:")) {
    return true;
  }
  try {
    const parsed = new URL(url);
    const base = new URL(NEWSLETTER_BASE_URL);
    return (
      parsed.origin === base.origin &&
      parsed.pathname.replace(/\/+$/, "") === "" &&
      parsed.search === ""
    );
  } catch {
    return false;
  }
};

// A footnote or table-of-contents link (`href="#note-1"`) resolves against
// the baseUrl to the publication root plus a fragment. That never leaves the
// generated document, so it may scroll in place at any time.
export const isFragmentNavigation = (url: string): boolean =>
  isSameDocumentUrl(url) && url.includes("#");

// Only the very first request may match the document's own URL. Once that
// allowance is claimed, a preview link to the publication root (`href="/"`)
// would otherwise load the real Substack home — and its cookie banner —
// inside the WebView, the exact App Review 5.1.2(i) failure. In-document
// fragment jumps stay allowed after the claim.
export const shouldAllowDocumentLoad = (
  url: string,
  documentClaimed: boolean,
): boolean =>
  isFragmentNavigation(url) || (!documentClaimed && isSameDocumentUrl(url));
