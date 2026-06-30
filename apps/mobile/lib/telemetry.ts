type TelemetryEnv = {
  readonly sentryDsn?: string;
  readonly posthogKey?: string;
  readonly posthogHost?: string;
};
type TelemetryProperty = string | number | boolean | null | TelemetryProperty[] | { [key: string]: TelemetryProperty };
type TelemetryProperties = Record<string, TelemetryProperty>;

type SentryModule = typeof import("@sentry/react-native");
type PostHogModule = typeof import("posthog-react-native");
type PostHogClient = InstanceType<PostHogModule["PostHog"]>;

let sentry: SentryModule | null = null;
let posthog: PostHogClient | null = null;
let initialized = false;

const hasValue = (value: string | undefined): value is string => typeof value === "string" && value.length > 0;

export const initTelemetry = async (
  env: TelemetryEnv = {
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST
  }
): Promise<void> => {
  if (initialized) {
    return;
  }

  initialized = true;

  const sentryDsn = env.sentryDsn;
  const posthogKey = env.posthogKey;

  if (hasValue(sentryDsn)) {
    sentry = await import("@sentry/react-native");
    sentry.init({ dsn: sentryDsn });
  }

  if (hasValue(posthogKey)) {
    const posthogModule = await import("posthog-react-native");
    posthog = new posthogModule.PostHog(posthogKey, {
      host: env.posthogHost
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
