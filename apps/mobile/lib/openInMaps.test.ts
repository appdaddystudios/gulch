import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above every `const`, so the mutable platform
// switch has to be hoisted with them.
const platform = vi.hoisted(() => ({ OS: "ios" }));
const openURL = vi.fn();
const canOpenURL = vi.fn();
const showActionSheetWithOptions = vi.fn();
const captureEvent = vi.fn();
const captureException = vi.fn();

vi.mock("react-native", () => ({
  Platform: platform,
  Linking: {
    openURL: (url: string) => openURL(url),
    canOpenURL: (url: string) => canOpenURL(url),
  },
  ActionSheetIOS: {
    showActionSheetWithOptions: (
      options: unknown,
      callback: (index: number) => void,
    ) => showActionSheetWithOptions(options, callback),
  },
}));
vi.mock("./telemetry", () => ({
  captureEvent: (event: string, properties?: unknown) => captureEvent(event, properties),
  captureException: (error: unknown) => captureException(error),
}));

import { openInMaps } from "./openInMaps";

const target = { name: "El Sótano", latitude: 33.7489, longitude: -84.3879 };

// Resolve the sheet with the given button index.
const pickSheetOption = (index: number) => {
  showActionSheetWithOptions.mockImplementation(
    (_options: unknown, callback: (index: number) => void) => callback(index),
  );
};

beforeEach(() => {
  platform.OS = "ios";
  openURL.mockReset().mockResolvedValue(true);
  canOpenURL.mockReset().mockResolvedValue(false);
  showActionSheetWithOptions.mockReset();
  captureEvent.mockReset();
  captureException.mockReset();
});

describe("openInMaps on iOS", () => {
  it("offers Apple Maps, Google Maps and Cancel", async () => {
    pickSheetOption(2);

    await openInMaps(target);

    expect(showActionSheetWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        options: ["Apple Maps", "Google Maps", "Cancel"],
        cancelButtonIndex: 2,
        title: "El Sótano",
      }),
      expect.any(Function),
    );
    expect(openURL).not.toHaveBeenCalled();
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it("opens Apple Maps and reports the scheme as the domain", async () => {
    pickSheetOption(0);

    await openInMaps(target);

    expect(openURL).toHaveBeenCalledWith(
      "maps://?q=El%20S%C3%B3tano&ll=33.7489,-84.3879",
    );
    expect(captureEvent).toHaveBeenCalledWith("link_opened", {
      domain: "maps",
      context: "event_location",
      provider: "apple",
    });
  });

  it("opens the Google Maps app when its scheme is openable", async () => {
    pickSheetOption(1);
    canOpenURL.mockResolvedValue(true);

    await openInMaps(target);

    expect(openURL).toHaveBeenCalledWith(
      "comgooglemaps://?q=33.7489,-84.3879(El%20S%C3%B3tano)",
    );
    expect(captureEvent).toHaveBeenCalledWith(
      "link_opened",
      expect.objectContaining({ domain: "comgooglemaps", provider: "google" }),
    );
  });

  it("falls back to the Google Maps universal link otherwise", async () => {
    pickSheetOption(1);

    await openInMaps(target);

    expect(openURL).toHaveBeenCalledWith(
      "https://www.google.com/maps/search/?api=1&query=33.7489,-84.3879",
    );
    expect(captureEvent).toHaveBeenCalledWith(
      "link_opened",
      expect.objectContaining({ domain: "www.google.com", provider: "google" }),
    );
  });

  it("treats a canOpenURL failure as not installed", async () => {
    pickSheetOption(1);
    canOpenURL.mockRejectedValue(new Error("no scheme"));

    await openInMaps(target);

    expect(openURL).toHaveBeenCalledWith(
      expect.stringContaining("https://www.google.com/maps/search/"),
    );
  });

  it("never throws when opening fails, and records no link", async () => {
    pickSheetOption(0);
    openURL.mockRejectedValue(new Error("nope"));

    await expect(openInMaps(target)).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureEvent).not.toHaveBeenCalled();
  });
});

describe("openInMaps on Android", () => {
  beforeEach(() => {
    platform.OS = "android";
  });

  it("hands the geo intent to the default maps app", async () => {
    await openInMaps(target);

    expect(showActionSheetWithOptions).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith(
      "geo:33.7489,-84.3879?q=33.7489,-84.3879(El%20S%C3%B3tano)",
    );
    // Whatever handles geo: is the user's default, not necessarily Google.
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      "link_opened",
      expect.objectContaining({ domain: "geo", provider: "system" }),
    );
  });

  it("falls back to the web link when no app handles geo:, counting the tap once", async () => {
    openURL
      .mockRejectedValueOnce(new Error("no handler"))
      .mockResolvedValueOnce(true);

    await openInMaps(target);

    expect(openURL).toHaveBeenLastCalledWith(
      "https://www.google.com/maps/search/?api=1&query=33.7489,-84.3879",
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      "link_opened",
      expect.objectContaining({ domain: "www.google.com", provider: "google" }),
    );
  });

  it("never throws when both attempts fail, and records no link", async () => {
    openURL.mockRejectedValue(new Error("no handler"));

    await expect(openInMaps(target)).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(2);
    expect(captureEvent).not.toHaveBeenCalled();
  });
});
