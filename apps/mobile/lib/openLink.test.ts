import { beforeEach, describe, expect, it, vi } from "vitest";

const openBrowserAsync = vi.fn();
const openURL = vi.fn();
const captureException = vi.fn();

vi.mock("expo-web-browser", () => ({ openBrowserAsync: (url: string) => openBrowserAsync(url) }));
vi.mock("react-native", () => ({ Linking: { openURL: (url: string) => openURL(url) } }));
vi.mock("./telemetry", () => ({ captureException: (error: unknown) => captureException(error) }));

import { isOpenableUrl, openLink } from "./openLink";

beforeEach(() => {
  openBrowserAsync.mockReset().mockResolvedValue({ type: "dismiss" });
  openURL.mockReset().mockResolvedValue(true);
  captureException.mockReset();
});

describe("isOpenableUrl", () => {
  it("accepts http and https URLs only", () => {
    expect(isOpenableUrl("https://gulchmagazine.com/research")).toBe(true);
    expect(isOpenableUrl("http://example.com")).toBe(true);
    expect(isOpenableUrl("javascript:alert(1)")).toBe(false);
    expect(isOpenableUrl("mailto:hi@example.com")).toBe(false);
    expect(isOpenableUrl("not a url")).toBe(false);
    expect(isOpenableUrl("")).toBe(false);
    expect(isOpenableUrl(null)).toBe(false);
    expect(isOpenableUrl(undefined)).toBe(false);
  });
});

describe("openLink", () => {
  it("opens valid URLs in the in-app browser", async () => {
    await openLink("https://instagram.com/p/abc/");

    expect(openBrowserAsync).toHaveBeenCalledWith("https://instagram.com/p/abc/");
    expect(openURL).not.toHaveBeenCalled();
  });

  it("does nothing for null, empty, or non-http(s) URLs", async () => {
    await openLink(null);
    await openLink(undefined);
    await openLink("");
    await openLink("javascript:alert(1)");

    expect(openBrowserAsync).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("falls back to the system browser when the in-app browser fails", async () => {
    openBrowserAsync.mockRejectedValue(new Error("sheet unavailable"));

    await openLink("https://example.com");

    expect(openURL).toHaveBeenCalledWith("https://example.com");
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("never throws even when both browser paths fail", async () => {
    openBrowserAsync.mockRejectedValue(new Error("sheet unavailable"));
    openURL.mockRejectedValue(new Error("no handler"));

    await expect(openLink("https://example.com")).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(2);
  });
});
