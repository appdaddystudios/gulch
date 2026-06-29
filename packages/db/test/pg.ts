import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import pg from "pg";

const { Client } = pg;

const execFileAsync = promisify(execFile);
const postgresBin = "/opt/homebrew/opt/postgresql@18/bin";
const postgresBinHasInitdb = existsSync(path.join(postgresBin, "initdb"));
const migrationPath = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260629000001_init_v1_mirror.sql"
);

export type TestPostgres = {
  readonly connectionString: string;
  readonly teardown: () => Promise<void>;
};

const withPostgresPath = {
  ...process.env,
  PATH: postgresBinHasInitdb ? `${postgresBin}:${process.env.PATH ?? ""}` : process.env.PATH
};

const commandExistsOnPath = (command: string): boolean => {
  const pathValue = withPostgresPath.PATH;

  if (!pathValue) {
    return false;
  }

  return pathValue.split(path.delimiter).some((dir) => existsSync(path.join(dir, command)));
};

const randomPort = (): number => 20_000 + Math.floor(Math.random() * 20_000);

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const createSupabaseCompatibility = async (connectionString: string): Promise<void> => {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon nologin;
        end if;

        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin;
        end if;

        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role nologin;
        end if;
      end
      $$;

      create schema if not exists auth;

      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select null::uuid;
      $$;

      create or replace function auth.role()
      returns text
      language sql
      stable
      as $$
        select null::text;
      $$;
    `);

    const roleResult = await client.query<{ role_name: string }>("select current_user as role_name");
    const roleName = roleResult.rows[0]?.role_name;

    if (!roleName) {
      throw new Error("Could not determine current Postgres role");
    }

    await client.query(`
      grant anon to ${quoteIdentifier(roleName)};
      grant authenticated to ${quoteIdentifier(roleName)};
      grant service_role to ${quoteIdentifier(roleName)};
    `);
  } finally {
    await client.end();
  }
};

const resetPublicSchema = async (connectionString: string): Promise<void> => {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      drop schema if exists public cascade;
      create schema public;
    `);
  } finally {
    await client.end();
  }
};

const applyMigration = async (connectionString: string): Promise<void> => {
  const client = new Client({ connectionString });
  const migrationSql = await readFile(migrationPath, "utf8");
  await client.connect();

  try {
    await client.query(migrationSql);
  } finally {
    await client.end();
  }
};

export const setupTestPostgres = async (): Promise<TestPostgres> => {
  if (process.env.DATABASE_URL) {
    const connectionString = process.env.DATABASE_URL;
    await createSupabaseCompatibility(connectionString);
    await resetPublicSchema(connectionString);
    await applyMigration(connectionString);

    return {
      connectionString,
      teardown: async () => undefined
    };
  }

  if (!commandExistsOnPath("initdb")) {
    throw new Error("No DATABASE_URL set and no local Postgres (initdb) found. Set DATABASE_URL or install postgresql.");
  }

  const dataDir = await mkdtemp(path.join(tmpdir(), "gulch-db-"));
  const logPath = path.join(dataDir, "postgres.log");
  const port = randomPort();
  const connectionString = `postgresql://localhost:${port}/gulch_test`;

  try {
    await execFileAsync("initdb", ["-D", dataDir, "--no-locale", "--encoding=UTF8"], { env: withPostgresPath });
    await execFileAsync(
      "pg_ctl",
      ["-D", dataDir, "-l", logPath, "-o", `-p ${port} -c listen_addresses=localhost`, "start", "-w"],
      { env: withPostgresPath }
    );

    await execFileAsync("createdb", ["-h", "localhost", "-p", String(port), "gulch_test"], { env: withPostgresPath });
    await createSupabaseCompatibility(connectionString);
    await applyMigration(connectionString);

    return {
      connectionString,
      teardown: async () => {
        await execFileAsync("pg_ctl", ["-D", dataDir, "stop", "-m", "fast", "-w"], { env: withPostgresPath });
        await rm(dataDir, { force: true, recursive: true });
      }
    };
  } catch (error) {
    await execFileAsync("pg_ctl", ["-D", dataDir, "stop", "-m", "fast", "-w"], { env: withPostgresPath }).catch(
      () => undefined
    );
    await rm(dataDir, { force: true, recursive: true });
    throw error;
  }
};
