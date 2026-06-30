import type { DbClient } from "@gulch/db";

export type Counts = {
  readonly locations: number;
  readonly events: number;
  readonly shows: number;
};

type CountTable = keyof Counts;

const countTable = async (client: DbClient, table: CountTable): Promise<number> => {
  const { count, error } = await client.from(table).select("webflow_item_id", {
    count: "exact",
    head: true
  });

  if (error) {
    throw error;
  }

  return count ?? 0;
};

export const getCounts = async (client: DbClient): Promise<Counts> => {
  const [locations, events, shows] = await Promise.all([
    countTable(client, "locations"),
    countTable(client, "events"),
    countTable(client, "shows")
  ]);

  return { locations, events, shows };
};
