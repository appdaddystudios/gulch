import "react-native-url-polyfill/auto";

import { createDbClient, type DbClient } from "@gulch/db";
import { z } from "zod";

const mobileSupabaseEnvSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1)
});

export const createMobileSupabase = (env: Record<string, string | undefined> = process.env): DbClient | null => {
  const parsed = mobileSupabaseEnvSchema.safeParse(env);

  if (!parsed.success) {
    return null;
  }

  return createDbClient({
    SUPABASE_URL: parsed.data.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_KEY: parsed.data.EXPO_PUBLIC_SUPABASE_ANON_KEY
  });
};
