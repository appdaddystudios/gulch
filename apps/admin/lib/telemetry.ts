import { PostHog } from "posthog-node";

type TelemetryEnv = {
  readonly EXPO_PUBLIC_POSTHOG_KEY?: string;
};

type PostHogClient = InstanceType<typeof PostHog>;

let postHogClient: PostHogClient | null = null;

const readTelemetryEnv = (): TelemetryEnv => ({
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY
});

export const initializeTelemetry = (env: TelemetryEnv = readTelemetryEnv()) => {
  if (env.EXPO_PUBLIC_POSTHOG_KEY && !postHogClient) {
    postHogClient = new PostHog(env.EXPO_PUBLIC_POSTHOG_KEY);
  }

  return {
    postHogEnabled: Boolean(postHogClient)
  };
};

export const captureEvent = (event: string, properties?: Record<string, unknown>): void => {
  if (postHogClient) {
    postHogClient.capture({
      distinctId: "gulch-admin",
      event,
      properties
    });
  }
};

// Errors go to PostHog as `$exception` events (its error-tracking event name)
// so failures stay visible without a second vendor.
export const captureException = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  const type = error instanceof Error ? error.name : "Error";
  captureEvent("$exception", { $exception_message: message, $exception_type: type });
};

export const shutdownTelemetry = async (): Promise<void> => {
  if (postHogClient) {
    await postHogClient.shutdown();
    postHogClient = null;
  }
};
