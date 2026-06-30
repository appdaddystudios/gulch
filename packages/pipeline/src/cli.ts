import { createDbClient } from "@gulch/db";
import { z } from "zod";

import { createGeocoder } from "./geocoder";
import { runSeed, type PipelineDbClient } from "./seed";
import { createWebflowClient } from "./webflow-client";

type ProcessEnv = Record<string, string | undefined>;

declare const process: {
  readonly env: ProcessEnv;
  readonly argv: readonly string[];
  exitCode?: number;
};

export const cliEnvSchema = z.object({
  GULCH_WEBFLOW_API_KEY: z.string().min(1),
  MAPBOX_TOKEN: z.string().min(1),
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
});

export function parseCliEnv(env: ProcessEnv): z.infer<typeof cliEnvSchema> {
  const parsed = cliEnvSchema.safeParse(env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid required seed environment variables: ${missing}`);
  }

  return parsed.data;
}

export async function main(): Promise<void> {
  const env = parseCliEnv(process.env);
  const supabase = createDbClient({
    SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
  });
  const db: PipelineDbClient = {
    deleteAll: async (table) => {
      const { error } = await supabase.from(table).delete().not("event_id", "is", null);
      return { error };
    },
    from: (table) => ({
      upsert: (rows, options) => supabase.from(table).upsert([...rows], options)
    })
  };

  const summary = await runSeed({
    webflow: createWebflowClient({ token: env.GULCH_WEBFLOW_API_KEY, fetch: globalThis.fetch.bind(globalThis) }),
    geocoder: createGeocoder({ token: env.MAPBOX_TOKEN, fetch: globalThis.fetch.bind(globalThis) }),
    db,
    logger: console
  });

  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
