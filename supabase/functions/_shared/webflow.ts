import { webflowItemEnvelopeSchema, webflowLiveItemsResponseSchema, type WebflowItem } from "./schemas.ts";

export type FetchLike = typeof fetch;

const WEBFLOW_BASE_URL = "https://api.webflow.com/v2";
const PAGE_LIMIT = 100;

function webflowHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
}

function keepPublished<T extends { isArchived: boolean; isDraft: boolean }>(item: T): boolean {
  return !item.isArchived && !item.isDraft;
}

export async function fetchLiveItems(
  token: string,
  collectionId: string,
  fetcher: FetchLike = fetch
): Promise<WebflowItem[]> {
  const items: WebflowItem[] = [];
  let offset = 0;

  for (;;) {
    const url = new URL(`${WEBFLOW_BASE_URL}/collections/${collectionId}/items/live`);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const response = await fetcher(url, { headers: webflowHeaders(token) });
    if (!response.ok) throw new Error(`Webflow live items failed: ${response.status}`);

    const parsed = webflowLiveItemsResponseSchema.parse(await response.json());
    items.push(...parsed.items.filter(keepPublished));

    const pageCount = parsed.items.length;
    const total = parsed.pagination?.total;
    offset += pageCount;
    if (pageCount < PAGE_LIMIT || (typeof total === "number" && offset >= total)) break;
  }

  return items;
}

export async function fetchLiveItem(
  token: string,
  collectionId: string,
  itemId: string,
  fetcher: FetchLike = fetch
): Promise<WebflowItem | null> {
  const url = `${WEBFLOW_BASE_URL}/collections/${collectionId}/items/${itemId}/live`;
  const response = await fetcher(url, { headers: webflowHeaders(token) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Webflow live item failed: ${response.status}`);

  const item = webflowItemEnvelopeSchema.parse(await response.json());
  return keepPublished(item) ? item : null;
}
