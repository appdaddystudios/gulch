import * as Sentry from "@sentry/nextjs";
import { PostHog } from "posthog-node";

type TelemetryEnv = {
  readonly EXPO_PUBLIC_SENTRY_DSN?: string;
  readonly EXPO_PUBLIC_POSTHOG_KEY?: string;
};

type PostHogClient = InstanceType<typeof PostHog>;

let sentryInitialized = false;
let postHogClient: PostHogClient | null = null;

const readTelemetryEnv = (): TelemetryEnv => ({
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY
});

export const initializeTelemetry = (env: TelemetryEnv = readTelemetryEnv()) => {
  if (env.EXPO_PUBLIC_SENTRY_DSN && !sentryInitialized) {
    Sentry.init({ dsn: env.EXPO_PUBLIC_SENTRY_DSN });
    sentryInitialized = true;
  }

  if (env.EXPO_PUBLIC_POSTHOG_KEY && !postHogClient) {
    postHogClient = new PostHog(env.EXPO_PUBLIC_POSTHOG_KEY);
  }

  return {
    sentryEnabled: sentryInitialized,
    postHogEnabled: Boolean(postHogClient)
  };
};

export const captureException = (error: unknown): void => {
  if (sentryInitialized) {
    Sentry.captureException(error);
  }
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

export const shutdownTelemetry = async (): Promise<void> => {
  if (postHogClient) {
    await postHogClient.shutdown();
    postHogClient = null;
  }
};
