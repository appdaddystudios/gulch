import { afterEach, describe, expect, it, vi } from "vitest";

import { captureEvent, captureException, initializeTelemetry, shutdownTelemetry } from "./telemetry";

const posthogCapture = vi.hoisted(() => vi.fn());

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: posthogCapture,
    shutdown: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe("telemetry", () => {
  afterEach(async () => {
    await shutdownTelemetry();
    vi.clearAllMocks();
  });

  it("is a no-op when telemetry env is absent", () => {
    const previousPostHogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;

    expect(initializeTelemetry()).toEqual({ postHogEnabled: false });
    expect(initializeTelemetry({})).toEqual({ postHogEnabled: false });

    expect(() => captureException(new Error("boom"))).not.toThrow();
    expect(() => captureEvent("admin.loaded")).not.toThrow();
    expect(posthogCapture).not.toHaveBeenCalled();

    if (previousPostHogKey) {
      process.env.EXPO_PUBLIC_POSTHOG_KEY = previousPostHogKey;
    } else {
      delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    }
  });

  it("initializes PostHog when a key is present and routes errors to it", async () => {
    const posthog = await import("posthog-node");

    expect(initializeTelemetry({ EXPO_PUBLIC_POSTHOG_KEY: "ph_test" })).toEqual({
      postHogEnabled: true
    });

    captureException(new Error("tracked"));
    captureEvent("admin.loaded", { connected: true });

    expect(posthog.PostHog).toHaveBeenCalledWith("ph_test");
    expect(posthogCapture).toHaveBeenCalledWith({
      distinctId: "gulch-admin",
      event: "$exception",
      properties: { $exception_message: "tracked", $exception_type: "Error" }
    });
    expect(posthogCapture).toHaveBeenCalledWith({
      distinctId: "gulch-admin",
      event: "admin.loaded",
      properties: { connected: true }
    });
  });
});
