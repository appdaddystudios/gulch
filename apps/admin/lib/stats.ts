import type { DbClient } from "@gulch/db";

export type AdminCounts = {
  readonly locations: number;
  readonly events: number;
  readonly shows: number;
};

type CountTable = keyof AdminCounts;

type CountQueryResult = {
  readonly count: number | null;
  readonly error: { readonly message: string } | null;
};

type CountQuery = PromiseLike<CountQueryResult>;

export type CountClient = Pick<DbClient, "from">;

const countTable = async (client: CountClient, table: CountTable): Promise<number> => {
  const result = await (client.from(table).select("*", { count: "exact", head: true }) as CountQuery);

  if (result.error) {
    throw new Error(`Failed to count ${table}: ${result.error.message}`);
  }

  return result.count ?? 0;
};

export const getCounts = async (client: CountClient): Promise<AdminCounts> => {
  const [locations, events, shows] = await Promise.all([
    countTable(client, "locations"),
    countTable(client, "events"),
    countTable(client, "shows")
  ]);

  return { locations, events, shows };
};
