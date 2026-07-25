import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

import { captureException } from "./telemetry";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

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

// Single path for every external link: keep the user inside the app via the
// system in-app browser sheet (which offers "open in browser" natively) and
// fall back to the external browser only if the sheet fails. Never throws.
export async function openLink(url: string | null | undefined): Promise<void> {
  if (!isOpenableUrl(url)) {
    return;
  }

  try {
    await WebBrowser.openBrowserAsync(url);
  } catch (browserError) {
    captureException(browserError);
    try {
      await Linking.openURL(url);
    } catch (linkingError) {
      captureException(linkingError);
    }
  }
}
