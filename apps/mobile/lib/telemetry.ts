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

type PendingCapture =
  | { readonly kind: "event"; readonly event: string; readonly properties?: TelemetryProperties }
  | { readonly kind: "screen"; readonly name: string };

// Captures fired before async init settles (e.g. a cold start straight into a
// screen with a mount-time captureEvent) are buffered, then flushed — or
// discarded when init settles without a key. Bounded so a stuck init can't
// grow the queue forever.
const MAX_PENDING_CAPTURES = 100;

let sentry: SentryModule | null = null;
let posthog: PostHogClient | null = null;
let initialized = false;
let initSettled = false;
let pending: PendingCapture[] = [];

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
      host: env.posthogHost,
      captureAppLifecycleEvents: true
    });
  }

  initSettled = true;
  if (posthog) {
    for (const item of pending) {
      if (item.kind === "event") {
        posthog.capture(item.event, item.properties);
      } else {
        posthog.screen(item.name);
      }
    }
  }
  pending = [];
};

export const captureException = (error: unknown): void => {
  sentry?.captureException(error);
};

const buffer = (item: PendingCapture): void => {
  if (!initSettled && pending.length < MAX_PENDING_CAPTURES) {
    pending.push(item);
  }
};

export const captureEvent = (event: string, properties?: TelemetryProperties): void => {
  if (posthog) {
    posthog.capture(event, properties);
    return;
  }
  buffer({ kind: "event", event, properties });
};

// Screen views use PostHog's dedicated $screen semantics (expo-router has no
// built-in autocapture hook, so the root layout reports pathname changes).
export const captureScreen = (name: string): void => {
  if (posthog) {
    posthog.screen(name);
    return;
  }
  buffer({ kind: "screen", name });
};

export const resetTelemetryForTest = (): void => {
  sentry = null;
  posthog = null;
  initialized = false;
  initSettled = false;
  pending = [];
};
