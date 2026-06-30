import { z } from "zod";

import type { FetchLike } from "./webflow-client";

export type GeocodeOk = {
  readonly latitude: number;
  readonly longitude: number;
  readonly status: "ok";
};

export type GeocodeFailed = {
  readonly latitude: null;
  readonly longitude: null;
  readonly status: "failed";
};

export type GeocodeResult = GeocodeOk | GeocodeFailed;

export type Geocoder = {
  readonly geocode: (address: string) => Promise<GeocodeResult>;
};

export type GeocoderOptions = {
  readonly token: string;
  readonly fetch?: FetchLike;
  readonly cache?: Map<string, GeocodeResult>;
  readonly minRelevance?: number;
};

export const GEORGIA_BBOX = "-85.61,30.36,-80.84,35.00";
export const MIN_RELEVANCE = 0.8;

const mapboxResponseSchema = z
  .object({
    features: z.array(
      z
        .object({
          center: z.tuple([z.number(), z.number()]),
          relevance: z.number().default(0)
        })
        .passthrough()
    )
  })
  .passthrough();

const streetNumberPattern = /\b\d{1,6}\s+\S/;
const georgiaPattern = /\b(?:GA|Georgia)\b/i;

export function createGeocoder(options: GeocoderOptions): Geocoder {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const cache = options.cache ?? new Map<string, GeocodeResult>();
  const minRelevance = options.minRelevance ?? MIN_RELEVANCE;

  return {
    async geocode(address) {
      const key = normalizeAddress(address);
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }

      let result: GeocodeResult = { latitude: null, longitude: null, status: "failed" };
      for (const candidate of buildGeocodeCandidates(address)) {
        result = await queryMapbox(fetchImpl, candidate, options.token, minRelevance);
        if (result.status === "ok") {
          break;
        }
      }
      cache.set(key, result);

      return result;
    }
  };
}

export function extractStreetAddress(input: string): string | null {
  return buildGeocodeCandidates(input)[1] ?? null;
}

export function buildGeocodeCandidates(input: string): string[] {
  const original = input.trim();
  if (original === "") return [];

  const segments = input.split(",").map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  return uniqueCandidates([
    original,
    ...segments.flatMap((segment, index) => {
      if (!streetNumberPattern.test(segment)) return [];
      const candidate = segments.slice(index).join(", ");
      return georgiaPattern.test(candidate) ? [candidate] : [`${candidate}, GA`];
    })
  ]);
}

function normalizeAddress(address: string): string {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueCandidates(candidates: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    const key = normalizeAddress(trimmed);
    if (trimmed === "" || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

async function queryMapbox(
  fetchImpl: FetchLike,
  address: string,
  token: string,
  minRelevance: number
): Promise<GeocodeResult> {
  const response = await fetchImpl(buildGeocodeUrl(address, token));
  if (!response.ok) {
    throw new Error(`Mapbox geocode failed with status ${response.status}`);
  }

  const parsed = mapboxResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid Mapbox geocode response: ${details}`);
  }

  const feature = parsed.data.features[0];
  const [longitude, latitude] = feature?.center ?? [];
  return feature === undefined || longitude === undefined || latitude === undefined || feature.relevance < minRelevance
    ? { latitude: null, longitude: null, status: "failed" }
    : { latitude, longitude, status: "ok" };
}

function buildGeocodeUrl(address: string, token: string): URL {
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("proximity", "-84.39,33.75");
  url.searchParams.set("bbox", GEORGIA_BBOX);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "us");
  return url;
}
