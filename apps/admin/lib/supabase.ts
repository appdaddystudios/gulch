import { createDbClient, type DbClient } from "@gulch/db";

type ServerSupabaseEnv = {
  readonly EXPO_PUBLIC_SUPABASE_URL?: string;
  readonly EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

const readServerSupabaseEnv = (): ServerSupabaseEnv => ({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
});

export const createServerSupabase = (env: ServerSupabaseEnv = readServerSupabaseEnv()): DbClient | null => {
  if (!env.EXPO_PUBLIC_SUPABASE_URL || !env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    console.info("Supabase admin client not created: missing public Supabase URL or anon key.");
    return null;
  }

  try {
    return createDbClient({
      SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL,
      SUPABASE_KEY: env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    });
  } catch (error) {
    console.error("Supabase admin client not created: invalid client configuration.", error);
    return null;
  }
};
