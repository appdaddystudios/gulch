import { describe, expect, it } from "vitest";

import {
  appleMapsUrl,
  geoIntentUrl,
  googleMapsAppUrl,
  googleMapsWebUrl,
  type MapsTarget,
} from "./mapsLink";

const located: MapsTarget = {
  name: "El Sótano",
  latitude: 33.7489,
  longitude: -84.3879,
};

const unlocated: MapsTarget = {
  name: "Echo Gallery & Bar",
  latitude: null,
  longitude: null,
};

describe("appleMapsUrl", () => {
  it("pins the venue by coordinates and labels it with the encoded name", () => {
    expect(appleMapsUrl(located)).toBe(
      "maps://?q=El%20S%C3%B3tano&ll=33.7489,-84.3879",
    );
  });

  it("falls back to a city-scoped name search without coordinates", () => {
    expect(appleMapsUrl(unlocated)).toBe(
      "maps://?q=Echo%20Gallery%20%26%20Bar%20Atlanta",
    );
  });
});

describe("googleMapsAppUrl", () => {
  it("uses the comgooglemaps scheme with coordinates and a labelled pin", () => {
    expect(googleMapsAppUrl(located)).toBe(
      "comgooglemaps://?q=33.7489,-84.3879(El%20S%C3%B3tano)",
    );
  });

  it("falls back to a city-scoped name search without coordinates", () => {
    expect(googleMapsAppUrl(unlocated)).toBe(
      "comgooglemaps://?q=Echo%20Gallery%20%26%20Bar%20Atlanta",
    );
  });
});

describe("googleMapsWebUrl", () => {
  it("builds the universal search link from coordinates", () => {
    expect(googleMapsWebUrl(located)).toBe(
      "https://www.google.com/maps/search/?api=1&query=33.7489,-84.3879",
    );
  });

  it("falls back to a city-scoped name search without coordinates", () => {
    expect(googleMapsWebUrl(unlocated)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Echo%20Gallery%20%26%20Bar%20Atlanta",
    );
  });
});

describe("geoIntentUrl", () => {
  it("builds a geo intent with a labelled pin", () => {
    expect(geoIntentUrl(located)).toBe(
      "geo:33.7489,-84.3879?q=33.7489,-84.3879(El%20S%C3%B3tano)",
    );
  });

  it("falls back to a 0,0 geo search without coordinates", () => {
    expect(geoIntentUrl(unlocated)).toBe(
      "geo:0,0?q=Echo%20Gallery%20%26%20Bar%20Atlanta",
    );
  });

  it("treats a single missing coordinate as unlocated", () => {
    expect(geoIntentUrl({ ...located, longitude: null })).toBe(
      "geo:0,0?q=El%20S%C3%B3tano%20Atlanta",
    );
  });
});
