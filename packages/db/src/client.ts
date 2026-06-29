import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "./types";

const dbClientEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_KEY: z.string().min(1)
});

export type DbClientEnv = {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_KEY?: string;
};
export type DbClient = SupabaseClient<Database>;

export const createDbClient = (env: DbClientEnv): DbClient => {
  const parsed = dbClientEnvSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid Supabase client configuration: ${details}`);
  }

  return createClient<Database>(parsed.data.SUPABASE_URL, parsed.data.SUPABASE_KEY);
};
