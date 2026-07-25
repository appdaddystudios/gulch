// Instagram's public /embed/ player is the only remaining way to play a
// post's video without authentication — the raw og:video file is no longer
// served to anonymous clients, so the app renders the embed in a WebView.

const instagramHostPattern = /(^|\.)instagram\.com$/i;
// Post path, optionally profile-scoped (e.g. /gvgatl/reel/CODE/).
const postPathPattern = /^\/(?:[^/]+\/)?(?:p|reel|tv)\/([^/?#]+)/;

export function instagramEmbedUrl(postUrl: string | null): string | null {
  if (!postUrl) {
    return null;
  }

  try {
    const parsed = new URL(postUrl);
    if (!instagramHostPattern.test(parsed.hostname)) {
      return null;
    }

    const match = postPathPattern.exec(parsed.pathname);
    return match ? `https://www.instagram.com/p/${match[1]}/embed/` : null;
  } catch {
    return null;
  }
}
