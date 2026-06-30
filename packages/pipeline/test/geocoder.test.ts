import { describe, expect, it } from "vitest";

import { GEORGIA_BBOX, buildGeocodeCandidates, createGeocoder, extractStreetAddress } from "../src/geocoder";
import type { FetchLike } from "../src/webflow-client";

const geocodeResponse = (features: readonly unknown[]): Response =>
  new Response(JSON.stringify({ features }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

const decodedQuery = (input: string | URL): string => {
  const pathname = new URL(String(input)).pathname;
  const encoded = pathname.split("/").at(-1)?.replace(/\.json$/, "") ?? "";
  return decodeURIComponent(encoded);
};

describe("extractStreetAddress", () => {
  it("extracts venue-prefixed street addresses and appends Georgia context", () => {
    expect(extractStreetAddress("Whitespace, 814 Edgewood Ave NE")).toBe("814 Edgewood Ave NE, GA");
  });

  it("keeps trailing city segments", () => {
    expect(extractStreetAddress("THE 3120, 3120 Crossing Park NW, Norcross")).toBe(
      "3120 Crossing Park NW, Norcross, GA"
    );
  });

  it("does not double append Georgia context", () => {
    expect(extractStreetAddress("Venue, 505 Courtland St NE, Atlanta, GA")).toBe(
      "505 Courtland St NE, Atlanta, GA"
    );
    expect(extractStreetAddress("Venue, 505 Courtland St NE, Atlanta, Georgia")).toBe(
      "505 Courtland St NE, Atlanta, Georgia"
    );
  });

  it("returns null when no street-number segment exists", () => {
    expect(extractStreetAddress("Virtual")).toBeNull();
    expect(extractStreetAddress("DM on Instagram for address")).toBeNull();
    expect(extractStreetAddress("Serenbe Neighborhood")).toBeNull();
  });

  it("keeps address-only inputs with Georgia context", () => {
    expect(extractStreetAddress("814 Edgewood Ave NE")).toBe("814 Edgewood Ave NE, GA");
  });
});

describe("buildGeocodeCandidates", () => {
  it("builds ordered candidates when a venue prefix also contains a number", () => {
    expect(buildGeocodeCandidates("505 Courtland, 505 Courtland St NE")).toEqual([
      "505 Courtland, 505 Courtland St NE",
      "505 Courtland, 505 Courtland St NE, GA",
      "505 Courtland St NE, GA"
    ]);
    expect(buildGeocodeCandidates("725 Ponce on the Atlanta Beltline, 725 Ponce Del Leon Ave NE")).toContain(
      "725 Ponce Del Leon Ave NE, GA"
    );
  });

  it("keeps trailing city segments and avoids double-appending Georgia context", () => {
    expect(buildGeocodeCandidates("B and P Studio, 1596 W Cleveland Ave, East Point")).toEqual([
      "B and P Studio, 1596 W Cleveland Ave, East Point",
      "1596 W Cleveland Ave, East Point, GA"
    ]);
    expect(buildGeocodeCandidates("Venue, 505 Courtland St NE, Atlanta, GA")).toEqual([
      "Venue, 505 Courtland St NE, Atlanta, GA",
      "505 Courtland St NE, Atlanta, GA"
    ]);
  });

  it("returns only the original input when there is no street number", () => {
    expect(buildGeocodeCandidates("Virtual")).toEqual(["Virtual"]);
  });

  it("de-duplicates candidates while preserving order", () => {
    expect(buildGeocodeCandidates("505 Courtland St NE, GA")).toEqual(["505 Courtland St NE, GA"]);
  });
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

  it("returns immediately when the original address passes relevance threshold", async () => {
    const queries: string[] = [];
    const fetch: FetchLike = async (input) => {
      queries.push(decodedQuery(input));
      return geocodeResponse([{ center: [-84.36, 33.76], relevance: 1 }]);
    };
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await expect(geocoder.geocode("Whitespace, 814 Edgewood Ave NE")).resolves.toEqual({
      latitude: 33.76,
      longitude: -84.36,
      status: "ok"
    });
    expect(queries).toEqual(["Whitespace, 814 Edgewood Ave NE"]);
  });

  it("falls back to an extracted street address when the venue-prefixed query has low relevance", async () => {
    const queries: string[] = [];
    const fetch: FetchLike = async (input) => {
      const query = decodedQuery(input);
      queries.push(query);
      if (query === "Whitespace, 814 Edgewood Ave NE") {
        return geocodeResponse([{ center: [-84.1, 33.1], relevance: 0.36 }]);
      }
      return geocodeResponse([{ center: [-84.365, 33.755], relevance: 1 }]);
    };
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await expect(geocoder.geocode("Whitespace, 814 Edgewood Ave NE")).resolves.toEqual({
      latitude: 33.755,
      longitude: -84.365,
      status: "ok"
    });
    expect(queries).toEqual(["Whitespace, 814 Edgewood Ave NE", "814 Edgewood Ave NE, GA"]);
  });

  it("recovers venue prefixes whose name segment also contains a number", async () => {
    const queries: string[] = [];
    const fetch: FetchLike = async (input) => {
      const query = decodedQuery(input);
      queries.push(query);
      return query === "505 Courtland St NE, GA"
        ? geocodeResponse([{ center: [-84.383, 33.768], relevance: 1 }])
        : geocodeResponse([{ center: [-84.1, 33.1], relevance: 0.36 }]);
    };
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await expect(geocoder.geocode("505 Courtland, 505 Courtland St NE")).resolves.toEqual({
      latitude: 33.768,
      longitude: -84.383,
      status: "ok"
    });
    expect(queries).toEqual([
      "505 Courtland, 505 Courtland St NE",
      "505 Courtland, 505 Courtland St NE, GA",
      "505 Courtland St NE, GA"
    ]);
  });

  it("stops at the first passing candidate", async () => {
    const queries: string[] = [];
    const fetch: FetchLike = async (input) => {
      const query = decodedQuery(input);
      queries.push(query);
      return query === "505 Courtland, 505 Courtland St NE, GA"
        ? geocodeResponse([{ center: [-84.2, 33.2], relevance: 0.9 }])
        : geocodeResponse([{ center: [-84.1, 33.1], relevance: 0.36 }]);
    };
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await expect(geocoder.geocode("505 Courtland, 505 Courtland St NE")).resolves.toEqual({
      latitude: 33.2,
      longitude: -84.2,
      status: "ok"
    });
    expect(queries).toEqual(["505 Courtland, 505 Courtland St NE", "505 Courtland, 505 Courtland St NE, GA"]);
  });

  it("fails when both original and extracted street-address queries are below threshold", async () => {
    const queries: string[] = [];
    const fetch: FetchLike = async (input) => {
      queries.push(decodedQuery(input));
      return geocodeResponse([{ center: [-84.1, 33.1], relevance: 0.36 }]);
    };
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await expect(geocoder.geocode("Wrong Venue, 505 Courtland St NE")).resolves.toEqual({
      latitude: null,
      longitude: null,
      status: "failed"
    });
    expect(queries).toEqual(["Wrong Venue, 505 Courtland St NE", "505 Courtland St NE, GA"]);
  });

  it("does not run a fallback query for non-address text", async () => {
    const queries: string[] = [];
    const fetch: FetchLike = async (input) => {
      queries.push(decodedQuery(input));
      return geocodeResponse([{ center: [-84.4, 33.7], relevance: 0.1 }]);
    };
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    await expect(geocoder.geocode("DM on Instagram for address")).resolves.toEqual({
      latitude: null,
      longitude: null,
      status: "failed"
    });
    expect(queries).toEqual(["DM on Instagram for address"]);
  });

  it("caches two-pass results by the original normalized address", async () => {
    let calls = 0;
    const fetch: FetchLike = async (input) => {
      calls += 1;
      return decodedQuery(input) === "Whitespace, 814 Edgewood Ave NE"
        ? geocodeResponse([{ center: [-84.1, 33.1], relevance: 0.36 }])
        : geocodeResponse([{ center: [-84.365, 33.755], relevance: 1 }]);
    };
    const geocoder = createGeocoder({ token: "mapbox-token", fetch });

    const first = await geocoder.geocode("Whitespace, 814 Edgewood Ave NE");
    const second = await geocoder.geocode(" whitespace,   814 edgewood ave ne ");

    expect(second).toEqual(first);
    expect(calls).toBe(2);
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
