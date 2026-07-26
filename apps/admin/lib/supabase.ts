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

type ServiceSupabaseEnv = {
  readonly EXPO_PUBLIC_SUPABASE_URL?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
};

const readServiceSupabaseEnv = (): ServiceSupabaseEnv => ({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
});

// Service-role client for admin writes — RLS leaves anon read-only on the
// homepage tables. Server actions only; must never reach client components.
export const createServiceSupabase = (env: ServiceSupabaseEnv = readServiceSupabaseEnv()): DbClient | null => {
  if (!env.EXPO_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.info("Supabase service client not created: missing Supabase URL or service role key.");
    return null;
  }

  try {
    return createDbClient({
      SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
    });
  } catch (error) {
    console.error("Supabase service client not created: invalid client configuration.", error);
    return null;
  }
};
