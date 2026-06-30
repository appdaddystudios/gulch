import { z } from "npm:zod";
import type { FetchLike } from "./webflow.ts";

export type GeocodeResult = {
  latitude: number | null;
  longitude: number | null;
  status: "pending" | "ok" | "failed";
};

const mapboxResponseSchema = z
  .object({
    features: z.array(
      z.object({
        center: z.tuple([z.number(), z.number()]),
        relevance: z.number().default(0)
      }).passthrough()
    )
  })
  .passthrough();

export const GEORGIA_BBOX = "-85.61,30.36,-80.84,35.00";
export const MIN_RELEVANCE = 0.8;

const cache = new Map<string, GeocodeResult>();
const streetNumberPattern = /\b\d{1,6}\s+\S/;
const georgiaPattern = /\b(?:GA|Georgia)\b/i;

export function clearGeocodeCache(): void {
  cache.clear();
}

export async function geocode(
  token: string,
  address: string | null,
  fetcher: FetchLike = fetch,
  minRelevance = MIN_RELEVANCE
): Promise<GeocodeResult> {
  if (address == null) return { latitude: null, longitude: null, status: "pending" };

  const normalized = address.trim();
  if (normalized === "") return { latitude: null, longitude: null, status: "pending" };

  const cached = cache.get(normalized);
  if (cached) return cached;

  let result: GeocodeResult = { latitude: null, longitude: null, status: "failed" };
  for (const candidate of buildGeocodeCandidates(normalized)) {
    result = await queryMapbox(token, candidate, fetcher, minRelevance);
    if (result.status === "ok") break;
  }

  cache.set(normalized, result);
  return result;
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
  token: string,
  address: string,
  fetcher: FetchLike,
  minRelevance: number
): Promise<GeocodeResult> {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("proximity", "-84.39,33.75");
  url.searchParams.set("bbox", GEORGIA_BBOX);
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "1");

  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Mapbox geocode failed: ${response.status}`);

  const parsed = mapboxResponseSchema.parse(await response.json());
  const feature = parsed.features[0];
  return feature !== undefined && feature.relevance >= minRelevance
    ? { longitude: feature.center[0], latitude: feature.center[1], status: "ok" }
    : { latitude: null, longitude: null, status: "failed" };
}
