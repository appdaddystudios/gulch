import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureEvent,
  captureException,
  captureScreen,
  initTelemetry,
  resetTelemetryForTest
} from "./telemetry";

const posthogCapture = vi.hoisted(() => vi.fn());
const posthogScreen = vi.hoisted(() => vi.fn());
const posthogConstructor = vi.hoisted(() =>
  vi.fn(function PostHog() {
    return {
      capture: posthogCapture,
      screen: posthogScreen
    };
  })
);

vi.mock("posthog-react-native", () => ({
  PostHog: posthogConstructor
}));

describe("telemetry", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetTelemetryForTest();
  });

  it("no-ops when telemetry env is absent", async () => {
    await expect(initTelemetry({})).resolves.toBeUndefined();
    expect(() => captureException(new Error("ignored"))).not.toThrow();
    expect(() => captureEvent("mobile_test")).not.toThrow();
    expect(() => captureScreen("/calendar")).not.toThrow();
  });

  it("is safe to initialize more than once without env", async () => {
    await initTelemetry({});
    await expect(initTelemetry({})).resolves.toBeUndefined();
  });

  it("buffers captures made before init and flushes them once PostHog is ready", async () => {
    captureEvent("map_opened");
    captureScreen("/map");

    expect(posthogCapture).not.toHaveBeenCalled();

    await initTelemetry({
      posthogKey: "ph_test",
      posthogHost: "https://us.i.posthog.com"
    });

    expect(posthogCapture).toHaveBeenCalledWith("map_opened", undefined);
    expect(posthogScreen).toHaveBeenCalledWith("/map");
  });

  it("discards buffered captures when init settles without a PostHog key", async () => {
    captureEvent("map_opened");

    await initTelemetry({});
    captureEvent("newsletter_viewed");

    expect(posthogCapture).not.toHaveBeenCalled();
    expect(posthogScreen).not.toHaveBeenCalled();
  });

  it("initializes and captures when telemetry env is present", async () => {
    await initTelemetry({
      posthogKey: "ph_test",
      posthogHost: "https://us.i.posthog.com"
    });

    const error = new Error("reported");
    captureException(error);
    captureEvent("mobile_test", { count: 1, ok: true });
    captureScreen("/event/evt-1");

    expect(posthogCapture).toHaveBeenCalledWith("$exception", {
      $exception_message: "reported",
      $exception_type: "Error"
    });
    expect(posthogConstructor).toHaveBeenCalledWith("ph_test", {
      host: "https://us.i.posthog.com",
      captureAppLifecycleEvents: true,
      disableGeoip: true
    });
    expect(posthogCapture).toHaveBeenCalledWith("mobile_test", { count: 1, ok: true });
    expect(posthogScreen).toHaveBeenCalledWith("/event/evt-1");
  });
});
