import { hmacSha256Hex, verifyHmacSha256 } from "../_shared/auth.ts";
import { buildGeocodeCandidates, clearGeocodeCache, extractStreetAddress, geocode } from "../_shared/geocode.ts";
import { deriveEventOrganizers, mapEvent, mapLocation, mapOrganizer } from "../_shared/mappers.ts";
import { reconcile } from "../_shared/reconcile.ts";
import { fetchLiveItem, fetchLiveItems } from "../_shared/webflow.ts";
import { assert, assertEquals, assertMatch, envelope } from "./helpers.ts";

const decodedQuery = (input: RequestInfo | URL): string => {
  const value = input instanceof Request ? input.url : String(input);
  const pathname = new URL(value).pathname;
  const encoded = pathname.split("/").at(-1)?.replace(/\.json$/, "") ?? "";
  return decodeURIComponent(encoded);
};

Deno.test("mappers normalize nullable optional strings like shared package", () => {
  const event = mapEvent({
    ...envelope,
    id: "event-empty-link",
    lastUpdated: "2026-06-04T12:00:00.000Z",
    fieldData: {
      name: "Empty Link Event",
      slug: "empty-link-event",
      "start-date-time": "2026-07-03T22:00:00.000Z",
      "external-link": "   "
    }
  });

  assertEquals(event.external_link, null);

  const location = mapLocation({
    ...envelope,
    id: "location-empty-optional",
    lastUpdated: "2026-06-03T12:00:00.000Z",
    fieldData: {
      name: "Location",
      slug: "location",
      "neighborhood-optional": ""
    }
  });

  assertEquals(location.neighborhood, null);
});

Deno.test("organizer mapper and event organizer derivation match node shared behavior", () => {
  const organizerRaw = {
    ...envelope,
    id: "organizer-1",
    lastUpdated: "2026-06-04T12:00:00.000Z",
    fieldData: {
      name: "Organizer One",
      slug: "organizer-one",
      "website-url": "https://example.com",
      "instagram-url": "",
      "facebook-url": null,
      "is-featured": true,
      "custom-color": "#ffcc00"
    }
  };
  const eventRaw = {
    ...envelope,
    id: "event-1",
    lastUpdated: "2026-06-04T12:00:00.000Z",
    fieldData: {
      name: "Event One",
      slug: "event-one",
      "start-date-time": "2026-07-03T22:00:00.000Z",
      "additional-organizers": ["organizer-1", { id: "organizer-2" }, "organizer-1"]
    }
  };

  assertEquals(mapOrganizer(organizerRaw), {
    webflow_item_id: "organizer-1",
    name: "Organizer One",
    slug: "organizer-one",
    website_url: "https://example.com",
    instagram_url: null,
    facebook_url: null,
    is_featured: true,
    custom_color: "#ffcc00",
    webflow_last_updated: "2026-06-04T12:00:00.000Z"
  });
  assertEquals(deriveEventOrganizers(eventRaw), [
    { event_id: "event-1", organizer_id: "organizer-1" },
    { event_id: "event-1", organizer_id: "organizer-2" }
  ]);
});

Deno.test("fetchLiveItems filters draft and archived live items", async () => {
  const items = await fetchLiveItems("token", "collection", async () =>
    new Response(JSON.stringify({
      items: [
        { ...envelope, id: "keep", lastUpdated: "2026-06-01T00:00:00.000Z", fieldData: {} },
        { ...envelope, id: "draft", isDraft: true, lastUpdated: "2026-06-01T00:00:00.000Z", fieldData: {} },
        { ...envelope, id: "archived", isArchived: true, lastUpdated: "2026-06-01T00:00:00.000Z", fieldData: {} }
      ],
      pagination: { limit: 100, offset: 0, total: 3 }
    }))
  );

  assertEquals(items.map((item) => item.id), ["keep"]);
});

Deno.test("fetchLiveItem uses the single live item endpoint", async () => {
  let calledUrl = "";
  const item = await fetchLiveItem("token", "collection", "item-123", async (input) => {
    calledUrl = String(input);
    return new Response(JSON.stringify({
      ...envelope,
      id: "item-123",
      lastUpdated: "2026-06-01T00:00:00.000Z",
      fieldData: {}
    }));
  });

  assertEquals(item?.id, "item-123");
  assertEquals(calledUrl, "https://api.webflow.com/v2/collections/collection/items/item-123/live");
});

Deno.test("geocode uses Mapbox center as longitude then latitude and returns pending for null address", async () => {
  clearGeocodeCache();
  assertEquals(await geocode("mapbox", null), { latitude: null, longitude: null, status: "pending" });
  assertEquals(await geocode("mapbox", "   "), { latitude: null, longitude: null, status: "pending" });

  let calledUrl = "";
  const result = await geocode("mapbox", "10 Krog St NE", async (input) => {
    calledUrl = String(input);
    return new Response(JSON.stringify({ features: [{ center: [-84.36, 33.76], relevance: 1 }] }));
  });

  assertEquals(result, { longitude: -84.36, latitude: 33.76, status: "ok" });
  assertMatch(calledUrl, /proximity=-84\.39%2C33\.75/);
  assertMatch(calledUrl, /bbox=-85\.61%2C30\.36%2C-80\.84%2C35\.00/);
  assertMatch(calledUrl, /country=us/);
  assertMatch(calledUrl, /limit=1/);
});

Deno.test("extractStreetAddress handles venue prefixes and Georgia context", () => {
  assertEquals(extractStreetAddress("Whitespace, 814 Edgewood Ave NE"), "814 Edgewood Ave NE, GA");
  assertEquals(
    extractStreetAddress("THE 3120, 3120 Crossing Park NW, Norcross"),
    "3120 Crossing Park NW, Norcross, GA"
  );
  assertEquals(extractStreetAddress("Venue, 505 Courtland St NE, Atlanta, GA"), "505 Courtland St NE, Atlanta, GA");
  assertEquals(
    extractStreetAddress("Venue, 505 Courtland St NE, Atlanta, Georgia"),
    "505 Courtland St NE, Atlanta, Georgia"
  );
  assertEquals(extractStreetAddress("Virtual"), null);
  assertEquals(extractStreetAddress("DM on Instagram for address"), null);
  assertEquals(extractStreetAddress("Serenbe Neighborhood"), null);
  assertEquals(extractStreetAddress("814 Edgewood Ave NE"), "814 Edgewood Ave NE, GA");
});

Deno.test("buildGeocodeCandidates creates ordered de-duplicated street-address fallbacks", () => {
  assertEquals(buildGeocodeCandidates("505 Courtland, 505 Courtland St NE"), [
    "505 Courtland, 505 Courtland St NE",
    "505 Courtland, 505 Courtland St NE, GA",
    "505 Courtland St NE, GA"
  ]);
  assert(buildGeocodeCandidates("725 Ponce on the Atlanta Beltline, 725 Ponce Del Leon Ave NE").includes(
    "725 Ponce Del Leon Ave NE, GA"
  ));
  assertEquals(buildGeocodeCandidates("B and P Studio, 1596 W Cleveland Ave, East Point"), [
    "B and P Studio, 1596 W Cleveland Ave, East Point",
    "1596 W Cleveland Ave, East Point, GA"
  ]);
  assertEquals(buildGeocodeCandidates("Venue, 505 Courtland St NE, Atlanta, GA"), [
    "Venue, 505 Courtland St NE, Atlanta, GA",
    "505 Courtland St NE, Atlanta, GA"
  ]);
  assertEquals(buildGeocodeCandidates("Virtual"), ["Virtual"]);
  assertEquals(buildGeocodeCandidates("505 Courtland St NE, GA"), ["505 Courtland St NE, GA"]);
});

Deno.test("geocode returns immediately when the original address passes relevance threshold", async () => {
  clearGeocodeCache();
  const queries: string[] = [];

  const result = await geocode("mapbox", "Whitespace, 814 Edgewood Ave NE", async (input) => {
    queries.push(decodedQuery(input));
    return new Response(JSON.stringify({ features: [{ center: [-84.36, 33.76], relevance: 1 }] }));
  });

  assertEquals(result, { longitude: -84.36, latitude: 33.76, status: "ok" });
  assertEquals(queries, ["Whitespace, 814 Edgewood Ave NE"]);
});

Deno.test("geocode falls back to the extracted street address after a low-relevance venue-prefixed result", async () => {
  clearGeocodeCache();
  const queries: string[] = [];

  const result = await geocode("mapbox", "Whitespace, 814 Edgewood Ave NE", async (input) => {
    const query = decodedQuery(input);
    queries.push(query);
    return new Response(JSON.stringify({
      features: query === "Whitespace, 814 Edgewood Ave NE"
        ? [{ center: [-84.1, 33.1], relevance: 0.36 }]
        : [{ center: [-84.365, 33.755], relevance: 1 }]
    }));
  });

  assertEquals(result, { longitude: -84.365, latitude: 33.755, status: "ok" });
  assertEquals(queries, ["Whitespace, 814 Edgewood Ave NE", "814 Edgewood Ave NE, GA"]);
});

Deno.test("geocode recovers venue prefixes whose name segment also contains a number", async () => {
  clearGeocodeCache();
  const queries: string[] = [];

  const result = await geocode("mapbox", "505 Courtland, 505 Courtland St NE", async (input) => {
    const query = decodedQuery(input);
    queries.push(query);
    return new Response(JSON.stringify({
      features: query === "505 Courtland St NE, GA"
        ? [{ center: [-84.383, 33.768], relevance: 1 }]
        : [{ center: [-84.1, 33.1], relevance: 0.36 }]
    }));
  });

  assertEquals(result, { longitude: -84.383, latitude: 33.768, status: "ok" });
  assertEquals(queries, [
    "505 Courtland, 505 Courtland St NE",
    "505 Courtland, 505 Courtland St NE, GA",
    "505 Courtland St NE, GA"
  ]);
});

Deno.test("geocode stops at the first passing candidate", async () => {
  clearGeocodeCache();
  const queries: string[] = [];

  const result = await geocode("mapbox", "505 Courtland, 505 Courtland St NE", async (input) => {
    const query = decodedQuery(input);
    queries.push(query);
    return new Response(JSON.stringify({
      features: query === "505 Courtland, 505 Courtland St NE, GA"
        ? [{ center: [-84.2, 33.2], relevance: 0.9 }]
        : [{ center: [-84.1, 33.1], relevance: 0.36 }]
    }));
  });

  assertEquals(result, { longitude: -84.2, latitude: 33.2, status: "ok" });
  assertEquals(queries, ["505 Courtland, 505 Courtland St NE", "505 Courtland, 505 Courtland St NE, GA"]);
});

Deno.test("geocode fails when original and extracted street address are below threshold", async () => {
  clearGeocodeCache();
  const queries: string[] = [];

  const result = await geocode("mapbox", "Wrong Venue, 505 Courtland St NE", async (input) => {
    queries.push(decodedQuery(input));
    return new Response(JSON.stringify({ features: [{ center: [-84.1, 33.1], relevance: 0.36 }] }));
  });

  assertEquals(result, { latitude: null, longitude: null, status: "failed" });
  assertEquals(queries, ["Wrong Venue, 505 Courtland St NE", "505 Courtland St NE, GA"]);
});

Deno.test("geocode does not run fallback query for non-address text", async () => {
  clearGeocodeCache();
  const queries: string[] = [];

  const result = await geocode("mapbox", "DM on Instagram for address", async (input) => {
    queries.push(decodedQuery(input));
    return new Response(JSON.stringify({ features: [{ center: [-84.1, 33.1], relevance: 0.1 }] }));
  });

  assertEquals(result, { latitude: null, longitude: null, status: "failed" });
  assertEquals(queries, ["DM on Instagram for address"]);
});

Deno.test("geocode caches two-pass results by the original normalized address", async () => {
  clearGeocodeCache();
  let calls = 0;

  const first = await geocode("mapbox", "Whitespace, 814 Edgewood Ave NE", async (input) => {
    calls += 1;
    return new Response(JSON.stringify({
      features: decodedQuery(input) === "Whitespace, 814 Edgewood Ave NE"
        ? [{ center: [-84.1, 33.1], relevance: 0.36 }]
        : [{ center: [-84.365, 33.755], relevance: 1 }]
    }));
  });
  const second = await geocode("mapbox", "Whitespace, 814 Edgewood Ave NE", async () => {
    calls += 1;
    return new Response(JSON.stringify({ features: [] }));
  });

  assertEquals(second, first);
  assertEquals(calls, 2);
});

Deno.test("geocode fails low-relevance Mapbox matches instead of storing garbage coordinates", async () => {
  clearGeocodeCache();

  const result = await geocode("mapbox", "Various Locations", async () =>
    new Response(JSON.stringify({ features: [{ center: [-83.0, 32.0], relevance: 0.4 }] }))
  );

  assertEquals(result, { latitude: null, longitude: null, status: "failed" });
});

Deno.test("geocode fails when Mapbox returns no features or missing relevance", async () => {
  clearGeocodeCache();

  const noFeatures = await geocode("mapbox", "Unknown address", async () =>
    new Response(JSON.stringify({ features: [] }))
  );
  const missingRelevance = await geocode("mapbox", "DM on Instagram for address", async () =>
    new Response(JSON.stringify({ features: [{ center: [-83.0, 32.0] }] }))
  );

  assertEquals(noFeatures, { latitude: null, longitude: null, status: "failed" });
  assertEquals(missingRelevance, { latitude: null, longitude: null, status: "failed" });
});

Deno.test("geocode uses normalized address cache keys", async () => {
  clearGeocodeCache();
  let calls = 0;

  const first = await geocode("mapbox", "10 Krog St NE", async () => {
    calls += 1;
    return new Response(JSON.stringify({ features: [{ center: [-84.36, 33.76], relevance: 1 }] }));
  });
  const second = await geocode("mapbox", "10 Krog St NE", async () => {
    calls += 1;
    return new Response(JSON.stringify({ features: [{ center: [-1, 1], relevance: 1 }] }));
  });

  assertEquals(calls, 1);
  assertEquals(first, { longitude: -84.36, latitude: 33.76, status: "ok" });
  assertEquals(second, first);
});

Deno.test("geocode throws on Mapbox errors", async () => {
  clearGeocodeCache();
  let thrown = "";

  try {
    await geocode("mapbox", "10 Krog St NE", async () => new Response("nope", { status: 500 }));
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  }

  assertMatch(thrown, /Mapbox geocode failed: 500/);
});

Deno.test("reconcile skips unchanged items and reuses unchanged location geocode fields", async () => {
  let geocodeCalls = 0;
  const items = [
    {
      ...envelope,
      id: "old-location",
      lastUpdated: "2026-06-01T00:00:00.000Z",
      fieldData: { name: "Old", slug: "old", "plain-text-name-address": "1 Same St" }
    },
    {
      ...envelope,
      id: "changed-location",
      lastUpdated: "2026-06-02T00:00:00.000Z",
      fieldData: { name: "Changed", slug: "changed", "plain-text-name-address": "2 New St" }
    }
  ];

  const result = await reconcile(items, "locations", {
    existingByIdLastUpdated: new Map([
      ["old-location", "2026-06-01T00:00:00.000Z"],
      ["changed-location", "2026-06-01T00:00:00.000Z"]
    ]),
    existingLocationsById: new Map([
      ["changed-location", {
        webflow_item_id: "changed-location",
        webflow_last_updated: "2026-06-01T00:00:00.000Z",
        name_address: "2 New St",
        latitude: 33.1,
        longitude: -84.1,
        geocode_status: "ok",
        geocoded_at: "2026-06-01T01:00:00.000Z"
      }]
    ]),
    geocoder: async () => {
      geocodeCalls += 1;
      return { latitude: 33.2, longitude: -84.2, status: "ok" };
    }
  });

  assertEquals(result.summary, { scanned: 2, upserted: 1, geocoded: 0, failed: 0 });
  assertEquals(geocodeCalls, 0);
  assert("latitude" in result.rows[0]);
  assertEquals(result.rows[0].latitude, 33.1);
});

Deno.test("HMAC helper verifies timestamp-prefixed raw body signatures", async () => {
  const signature = await hmacSha256Hex("secret", "123:{\"ok\":true}");
  assert(await verifyHmacSha256("secret", "123", "{\"ok\":true}", signature));
  assert(await verifyHmacSha256("secret", "123", "{\"ok\":true}", `sha256=${signature}`));
  assert(!(await verifyHmacSha256("secret", "123", "{\"ok\":false}", signature)));
});
