import { describe, expect, it } from "vitest";

import { GEORGIA_BBOX, createGeocoder } from "../src/geocoder";
import type { FetchLike } from "../src/webflow-client";

const geocodeResponse = (features: readonly unknown[]): Response =>
  new Response(JSON.stringify({ features }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

describe("createGeocoder", () => {
  it("returns latitude and longitude from Mapbox center in the correct order", async () => {
    let requestedUrl: URL | undefined;
    const fetch: FetchLike = async (input) => {
      requestedUrl = new URL(String(input));
      return geocodeResponse([{ center: [-84.371, 33.772], relevance: 1 }]);
    };

    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await expect(geocoder.geocode("10 Krog St NE")).resolves.toEqual({
      latitude: 33.772,
      longitude: -84.371,
      status: "ok"
    });
    expect(requestedUrl?.searchParams.get("proximity")).toBe("-84.39,33.75");
    expect(requestedUrl?.searchParams.get("bbox")).toBe(GEORGIA_BBOX);
    expect(requestedUrl?.searchParams.get("country")).toBe("us");
  });

  it("uses normalized address cache keys and avoids duplicate fetches", async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      return geocodeResponse([{ center: [-84.4, 33.7], relevance: 1 }]);
    };
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await geocoder.geocode("  10   Krog St NE ");
    await geocoder.geocode("10 krog st ne");

    expect(calls).toBe(1);
  });

  it("returns failed with null coordinates when Mapbox has no features", async () => {
    const fetch: FetchLike = async () => geocodeResponse([]);
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await expect(geocoder.geocode("Unknown address")).resolves.toEqual({
      latitude: null,
      longitude: null,
      status: "failed"
    });
  });

  it("returns failed with null coordinates when the top feature relevance is too low", async () => {
    const fetch: FetchLike = async () => geocodeResponse([{ center: [-84.4, 33.7], relevance: 0.4 }]);
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await expect(geocoder.geocode("Various Locations")).resolves.toEqual({
      latitude: null,
      longitude: null,
      status: "failed"
    });
  });

  it("allows a custom relevance threshold for tests", async () => {
    const fetch: FetchLike = async () => geocodeResponse([{ center: [-84.4, 33.7], relevance: 0.7 }]);
    const geocoder = createGeocoder({ token: "mapbox-token", fetch, minRelevance: 0.6 });

    await expect(geocoder.geocode("10 Krog St NE")).resolves.toEqual({
      latitude: 33.7,
      longitude: -84.4,
      status: "ok"
    });
  });

  it("throws on Mapbox errors and invalid response bodies", async () => {
    const failing = createGeocoder({
      token: "mapbox-token",
      fetch: async () => new Response("nope", { status: 500 })
    });
    await expect(failing.geocode("10 Krog St NE")).rejects.toThrow(/Mapbox geocode failed with status 500/);

    const invalid = createGeocoder({
      token: "mapbox-token",
      fetch: async () => new Response(JSON.stringify({ features: [{ center: ["bad", 33.7], relevance: 1 }] }))
    });
    await expect(invalid.geocode("10 Krog St NE")).rejects.toThrow(/Invalid Mapbox geocode response: .*center/s);
  });
});
