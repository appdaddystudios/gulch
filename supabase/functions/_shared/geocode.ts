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

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(normalized)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("proximity", "-84.39,33.75");
  url.searchParams.set("bbox", GEORGIA_BBOX);
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "1");

  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Mapbox geocode failed: ${response.status}`);

  const parsed = mapboxResponseSchema.parse(await response.json());
  const feature = parsed.features[0];
  const result: GeocodeResult = feature !== undefined && feature.relevance >= minRelevance
    ? { longitude: feature.center[0], latitude: feature.center[1], status: "ok" }
    : { latitude: null, longitude: null, status: "failed" };

  cache.set(normalized, result);
  return result;
}
