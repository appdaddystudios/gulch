import { z } from "zod";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export type WebflowClient = {
  readonly fetchAllItems: (collectionId: string) => Promise<readonly unknown[]>;
};

export type WebflowClientOptions = {
  readonly token: string;
  readonly fetch?: FetchLike;
  readonly sleep?: Sleep;
  readonly maxRetries?: number;
};

const pageLimit = 100;
const baseUrl = "https://api.webflow.com/v2";
const defaultRetryCount = 3;

export const WEBFLOW_COLLECTION_IDS = {
  organizers: "6a430e64b51f80db57a22b3c",
  locations: "6843bee91e942f36fd3adc06",
  events: "6845d39c294d60e4c197cee9",
  shows: "6865fb691dda49a9c7043754"
} as const;

const webflowPageSchema = z
  .object({
    items: z.array(z.unknown()),
    pagination: z.object({
      limit: z.number(),
      offset: z.number(),
      total: z.number()
    })
  })
  .passthrough();

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createWebflowClient(options: WebflowClientOptions): WebflowClient {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? defaultRetryCount;

  const fetchPage = async (collectionId: string, offset: number): Promise<z.infer<typeof webflowPageSchema>> => {
    const url = new URL(`${baseUrl}/collections/${collectionId}/items/live`);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(pageLimit));

    const response = await fetchWithRetry(fetchImpl, sleep, url, options.token, maxRetries);

    if (!response.ok) {
      throw new Error(`Webflow request failed with status ${response.status}: ${await bodySnippet(response)}`);
    }

    const parsed = webflowPageSchema.safeParse(await response.json());
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`Invalid Webflow response: ${details}`);
    }

    return parsed.data;
  };

  return {
    async fetchAllItems(collectionId) {
      const items: unknown[] = [];
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;

      while (offset < total) {
        const page = await fetchPage(collectionId, offset);
        items.push(...page.items.filter(isPublicItem));
        total = page.pagination.total;
        offset += page.pagination.limit;
      }

      return items;
    }
  };
}

async function fetchWithRetry(
  fetchImpl: FetchLike,
  sleep: Sleep,
  url: URL,
  token: string,
  maxRetries: number
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok || response.status < 500 || attempt === maxRetries - 1) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries - 1) {
        throw error;
      }
    }

    await sleep(2 ** attempt * 100);
  }

  throw lastError instanceof Error ? lastError : new Error("Webflow request failed before receiving a response");
}

async function bodySnippet(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, 300);
}

function isPublicItem(item: unknown): boolean {
  if (typeof item !== "object" || item === null) {
    return true;
  }

  const envelope = item as { readonly isArchived?: unknown; readonly isDraft?: unknown };
  return envelope.isArchived !== true && envelope.isDraft !== true;
}
