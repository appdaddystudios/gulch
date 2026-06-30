import { afterEach, describe, expect, it, vi } from "vitest";

import { captureEvent, captureException, initializeTelemetry, shutdownTelemetry } from "./telemetry";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  init: vi.fn()
}));

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe("telemetry", () => {
  afterEach(async () => {
    await shutdownTelemetry();
    vi.clearAllMocks();
  });

  it("is a no-op when telemetry env is absent", () => {
    const previousDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
    const previousPostHogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;

    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;

    expect(initializeTelemetry()).toEqual({
      sentryEnabled: false,
      postHogEnabled: false
    });
    expect(initializeTelemetry({})).toEqual({
      sentryEnabled: false,
      postHogEnabled: false
    });

    expect(() => captureException(new Error("boom"))).not.toThrow();
    expect(() => captureEvent("admin.loaded")).not.toThrow();

    if (previousDsn) {
      process.env.EXPO_PUBLIC_SENTRY_DSN = previousDsn;
    } else {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    }

    if (previousPostHogKey) {
      process.env.EXPO_PUBLIC_POSTHOG_KEY = previousPostHogKey;
    } else {
      delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    }
  });

  it("initializes wrappers when keys are present", async () => {
    const sentry = await import("@sentry/nextjs");
    const posthog = await import("posthog-node");

    expect(
      initializeTelemetry({
        EXPO_PUBLIC_SENTRY_DSN: "https://example@sentry.io/1",
        EXPO_PUBLIC_POSTHOG_KEY: "ph_test"
      })
    ).toEqual({
      sentryEnabled: true,
      postHogEnabled: true
    });

    captureException(new Error("tracked"));
    captureEvent("admin.loaded", { connected: true });

    expect(sentry.init).toHaveBeenCalledWith({ dsn: "https://example@sentry.io/1" });
    expect(sentry.captureException).toHaveBeenCalled();
    expect(posthog.PostHog).toHaveBeenCalledWith("ph_test");
  });
});
