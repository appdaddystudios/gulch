import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

import { captureEvent, captureException } from "./telemetry";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

type LinkTarget = "sheet" | "browser";

export const isOpenableUrl = (url: string | null | undefined): url is string => {
  if (typeof url !== "string" || url.length === 0) {
    return false;
  }

  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
};

// `context` names the UI surface for analytics (domain only — never the path,
// which can carry identifying content).
const captureLinkOpened = (
  url: string,
  context: string | undefined,
  target: LinkTarget,
): void => {
  captureEvent("link_opened", {
    domain: new URL(url).hostname,
    context: context ?? null,
    target,
  });
};

// Default path for external links: keep the user inside the app via the
// system in-app browser sheet (which offers "open in browser" natively) and
// fall back to the external browser only if the sheet fails. The event is
// recorded once, with the target that actually opened. Never throws.
export async function openLink(
  url: string | null | undefined,
  context?: string,
): Promise<void> {
  if (!isOpenableUrl(url)) {
    return;
  }

  try {
    // "close" renders an ✕ on the iOS sheet instead of the default "Done" check.
    await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: "close" });
    captureLinkOpened(url, context, "sheet");
  } catch (browserError) {
    captureException(browserError);
    try {
      await Linking.openURL(url);
      captureLinkOpened(url, context, "browser");
    } catch (linkingError) {
      captureException(linkingError);
    }
  }
}

// Leaves the app for the user's default browser — no sheet. The Newsletter
// surface uses this so no third-party page ever renders in-app (App Review
// 5.1.2(i)). Never throws.
export async function openInBrowser(
  url: string | null | undefined,
  context?: string,
): Promise<void> {
  if (!isOpenableUrl(url)) {
    return;
  }

  try {
    await Linking.openURL(url);
    captureLinkOpened(url, context, "browser");
  } catch (error) {
    captureException(error);
  }
}
