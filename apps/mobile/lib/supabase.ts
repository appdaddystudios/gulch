import "react-native-url-polyfill/auto";

import { createDbClient, type DbClient } from "@gulch/db";
import { z } from "zod";

const mobileSupabaseEnvSchema = z.object({
  url: z.string().url(),
  key: z.string().min(1)
});

type MobileSupabaseEnv = {
  readonly url?: string;
  readonly key?: string;
};

export const createMobileSupabase = (
  env: MobileSupabaseEnv = {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  }
): DbClient | null => {
  const parsed = mobileSupabaseEnvSchema.safeParse(env);

  if (!parsed.success) {
    return null;
  }

  return createDbClient({
    SUPABASE_URL: parsed.data.url,
    SUPABASE_KEY: parsed.data.key
  });
};
