import { ActionSheetIOS, Linking, Platform } from "react-native";

import {
  appleMapsUrl,
  geoIntentUrl,
  googleMapsAppUrl,
  googleMapsWebUrl,
  type MapsProvider,
  type MapsTarget,
} from "./mapsLink";
import { captureEvent, captureException } from "./telemetry";

const SHEET_OPTIONS = ["Apple Maps", "Google Maps", "Cancel"] as const;
const APPLE_INDEX = 0;
const GOOGLE_INDEX = 1;
const CANCEL_INDEX = 2;

// Scheme URLs (maps://, geo:) have no hostname; report the scheme so the
// link_opened taxonomy still says which app was targeted.
const domainOf = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.protocol.replace(/:$/, "");
  } catch {
    return url.split(":")[0] ?? url;
  }
};

// Reported only after the launch succeeds, so an attempt that falls through
// to a fallback (Android geo: with no handler) counts the tap once, for the
// app that actually opened.
const open = async (url: string, provider: MapsProvider): Promise<void> => {
  await Linking.openURL(url);
  captureEvent("link_opened", {
    domain: domainOf(url),
    context: "event_location",
    provider,
  });
};

// The comgooglemaps scheme is not declared in LSApplicationQueriesSchemes, so
// canOpenURL reports false even when the app is installed; the universal link
// then hands off to the app anyway. Declaring the scheme would need a native
// rebuild for no user-visible gain.
const openGoogle = async (target: MapsTarget): Promise<void> => {
  const appUrl = googleMapsAppUrl(target);
  const canOpenApp = await Linking.canOpenURL(appUrl).catch(() => false);
  await open(canOpenApp ? appUrl : googleMapsWebUrl(target), "google");
};

// The geo: intent goes to whatever the user made default — not necessarily
// Google — so it is attributed to "system"; only the web fallback is Google's.
const openAndroid = async (target: MapsTarget): Promise<void> => {
  try {
    await open(geoIntentUrl(target), "system");
  } catch (error) {
    captureException(error);
    await open(googleMapsWebUrl(target), "google");
  }
};

const chooseIos = (target: MapsTarget): Promise<void> =>
  new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...SHEET_OPTIONS],
        cancelButtonIndex: CANCEL_INDEX,
        title: target.name,
      },
      (index) => {
        const action =
          index === APPLE_INDEX
            ? open(appleMapsUrl(target), "apple")
            : index === GOOGLE_INDEX
              ? openGoogle(target)
              : Promise.resolve();
        void action.catch(captureException).finally(resolve);
      },
    );
  });

// Opens the venue in a maps app. iOS asks Apple vs Google; Android hands the
// geo intent to the user's default. Never throws.
export async function openInMaps(target: MapsTarget): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await chooseIos(target);
    } else {
      await openAndroid(target);
    }
  } catch (error) {
    captureException(error);
  }
}
