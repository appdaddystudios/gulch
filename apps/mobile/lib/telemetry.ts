type TelemetryEnv = {
  readonly posthogKey?: string;
  readonly posthogHost?: string;
};
type TelemetryProperty = string | number | boolean | null | TelemetryProperty[] | { [key: string]: TelemetryProperty };
type TelemetryProperties = Record<string, TelemetryProperty>;

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

let posthog: PostHogClient | null = null;
let initialized = false;
let initSettled = false;
let pending: PendingCapture[] = [];

const hasValue = (value: string | undefined): value is string => typeof value === "string" && value.length > 0;

export const initTelemetry = async (
  env: TelemetryEnv = {
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST
  }
): Promise<void> => {
  if (initialized) {
    return;
  }

  initialized = true;

  const posthogKey = env.posthogKey;

  if (hasValue(posthogKey)) {
    const posthogModule = await import("posthog-react-native");
    posthog = new posthogModule.PostHog(posthogKey, {
      host: env.posthogHost,
      captureAppLifecycleEvents: true,
      // No IP-derived location on events: keeps the App Store privacy label
      // free of "Coarse Location" — the dashboards never use geography.
      disableGeoip: true
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

// Errors go to PostHog as `$exception` events (its error-tracking event name)
// so failures stay visible without a second vendor.
export const captureException = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  const type = error instanceof Error ? error.name : "Error";
  captureEvent("$exception", { $exception_message: message, $exception_type: type });
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
  posthog = null;
  initialized = false;
  initSettled = false;
  pending = [];
};
