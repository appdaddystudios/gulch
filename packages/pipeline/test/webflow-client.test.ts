import { describe, expect, it } from "vitest";

import { createWebflowClient, type FetchLike } from "../src/webflow-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("createWebflowClient", () => {
  it("paginates and concatenates all collection items", async () => {
    const seenUrls: string[] = [];
    const fetch: FetchLike = async (input) => {
      const url = new URL(String(input));
      seenUrls.push(url.toString());
      const offset = Number(url.searchParams.get("offset"));

      return jsonResponse({
        items: offset === 0 ? [{ id: "first" }, { id: "second" }] : [{ id: "third" }],
        pagination: { limit: 100, offset, total: 101 }
      });
    };

    const client = createWebflowClient({ token: "wf-token", fetch });

    await expect(client.fetchAllItems("collection-1")).resolves.toEqual([
      { id: "first" },
      { id: "second" },
      { id: "third" }
    ]);
    expect(seenUrls).toHaveLength(2);
    expect(seenUrls[0]).toContain("/v2/collections/collection-1/items");
    expect(new URL(seenUrls[1] ?? "").searchParams.get("offset")).toBe("100");
  });

  it("throws a clear status and body snippet for non-200 responses", async () => {
    const fetch: FetchLike = async () => new Response("bad token and request body", { status: 401 });
    const client = createWebflowClient({ token: "wf-token", fetch });

    await expect(client.fetchAllItems("collection-1")).rejects.toThrow(
      /Webflow request failed with status 401: bad token/
    );
  });

  it("retries transient failures with injected sleep and no real delay", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      if (calls < 3) {
        return new Response("temporary", { status: 503 });
      }

      return jsonResponse({
        items: [{ id: "ok" }],
        pagination: { limit: 100, offset: 0, total: 1 }
      });
    };

    const client = createWebflowClient({
      token: "wf-token",
      fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      }
    });

    await expect(client.fetchAllItems("collection-1")).resolves.toEqual([{ id: "ok" }]);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it("throws invalid response details when the envelope shape is wrong", async () => {
    const fetch: FetchLike = async () => jsonResponse({ items: "not an array", pagination: {} });
    const client = createWebflowClient({ token: "wf-token", fetch });

    await expect(client.fetchAllItems("collection-1")).rejects.toThrow(/Invalid Webflow response: .*items/s);
  });

  it("rethrows the last network error after retries are exhausted", async () => {
    const sleeps: number[] = [];
    const fetch: FetchLike = async () => {
      throw new Error("socket closed");
    };
    const client = createWebflowClient({
      token: "wf-token",
      fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      }
    });

    await expect(client.fetchAllItems("collection-1")).rejects.toThrow(/socket closed/);
    expect(sleeps).toEqual([100, 200]);
  });
});
