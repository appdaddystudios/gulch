import { createDbClient } from "@gulch/db";
import { z } from "zod";

import { createGeocoder } from "./geocoder";
import { runRegeocode, type RegeocodeDbClient } from "./regeocode";

type ProcessEnv = Record<string, string | undefined>;
type ServiceRoleDbEnv = {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_KEY: string;
};

declare const process: {
  readonly env: ProcessEnv;
  readonly argv: readonly string[];
  exitCode?: number;
};

export const regeocodeCliEnvSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MAPBOX_TOKEN: z.string().min(1)
});

export function parseRegeocodeCliEnv(env: ProcessEnv): z.infer<typeof regeocodeCliEnvSchema> {
  const parsed = regeocodeCliEnvSchema.safeParse(env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid required re-geocode environment variables: ${missing}`);
  }

  return parsed.data;
}

export async function main(): Promise<void> {
  const env = parseRegeocodeCliEnv(process.env);
  const createServiceRoleDb = createDbClient as unknown as (dbEnv: ServiceRoleDbEnv) => RegeocodeDbClient;
  const db = createServiceRoleDb({
    SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
  });
  const summary = await runRegeocode({
    db,
    geocoder: createGeocoder({ token: env.MAPBOX_TOKEN, fetch: globalThis.fetch.bind(globalThis) }),
    logger: console
  });

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
