type TelemetryEnv = Record<string, string | undefined>;
type TelemetryProperty = string | number | boolean | null | TelemetryProperty[] | { [key: string]: TelemetryProperty };
type TelemetryProperties = Record<string, TelemetryProperty>;

type SentryModule = typeof import("@sentry/react-native");
type PostHogModule = typeof import("posthog-react-native");
type PostHogClient = InstanceType<PostHogModule["PostHog"]>;

let sentry: SentryModule | null = null;
let posthog: PostHogClient | null = null;
let initialized = false;

const hasValue = (value: string | undefined): value is string => typeof value === "string" && value.length > 0;

export const initTelemetry = async (env: TelemetryEnv = process.env): Promise<void> => {
  if (initialized) {
    return;
  }

  initialized = true;

  const sentryDsn = env.EXPO_PUBLIC_SENTRY_DSN;
  const posthogKey = env.EXPO_PUBLIC_POSTHOG_KEY;

  if (hasValue(sentryDsn)) {
    sentry = await import("@sentry/react-native");
    sentry.init({ dsn: sentryDsn });
  }

  if (hasValue(posthogKey)) {
    const posthogModule = await import("posthog-react-native");
    posthog = new posthogModule.PostHog(posthogKey, {
      host: env.EXPO_PUBLIC_POSTHOG_HOST
    });
  }
};

export const captureException = (error: unknown): void => {
  sentry?.captureException(error);
};

export const captureEvent = (event: string, properties?: TelemetryProperties): void => {
  posthog?.capture(event, properties);
};

export const resetTelemetryForTest = (): void => {
  sentry = null;
  posthog = null;
  initialized = false;
};
