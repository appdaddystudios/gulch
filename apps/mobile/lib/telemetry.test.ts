import { afterEach, describe, expect, it, vi } from "vitest";

import { captureEvent, captureException, initTelemetry, resetTelemetryForTest } from "./telemetry";

const sentryInit = vi.hoisted(() => vi.fn());
const sentryCaptureException = vi.hoisted(() => vi.fn());
const posthogCapture = vi.hoisted(() => vi.fn());
const posthogConstructor = vi.hoisted(() =>
  vi.fn(function PostHog() {
    return {
      capture: posthogCapture
    };
  })
);

vi.mock("@sentry/react-native", () => ({
  init: sentryInit,
  captureException: sentryCaptureException
}));

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
  });

  it("is safe to initialize more than once without env", async () => {
    await initTelemetry({});
    await expect(initTelemetry({})).resolves.toBeUndefined();
  });

  it("initializes and captures when telemetry env is present", async () => {
    await initTelemetry({
      EXPO_PUBLIC_SENTRY_DSN: "https://public@example.com/1",
      EXPO_PUBLIC_POSTHOG_KEY: "ph_test",
      EXPO_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com"
    });

    const error = new Error("reported");
    captureException(error);
    captureEvent("mobile_test", { count: 1, ok: true });

    expect(sentryInit).toHaveBeenCalledWith({ dsn: "https://public@example.com/1" });
    expect(sentryCaptureException).toHaveBeenCalledWith(error);
    expect(posthogConstructor).toHaveBeenCalledWith("ph_test", { host: "https://us.i.posthog.com" });
    expect(posthogCapture).toHaveBeenCalledWith("mobile_test", { count: 1, ok: true });
  });
});
