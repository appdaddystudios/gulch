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
    const url = new URL(`${baseUrl}/collections/${collectionId}/items`);
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
        items.push(...page.items);
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
