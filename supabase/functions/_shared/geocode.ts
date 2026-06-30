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
        center: z.tuple([z.number(), z.number()])
      }).passthrough()
    )
  })
  .passthrough();

const cache = new Map<string, GeocodeResult>();

export function clearGeocodeCache(): void {
  cache.clear();
}

export async function geocode(token: string, address: string | null, fetcher: FetchLike = fetch): Promise<GeocodeResult> {
  if (address == null) return { latitude: null, longitude: null, status: "pending" };

  const normalized = address.trim();
  if (normalized === "") return { latitude: null, longitude: null, status: "pending" };

  const cached = cache.get(normalized);
  if (cached) return cached;

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(normalized)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("proximity", "-84.39,33.75");
  url.searchParams.set("bbox", "-84.55,33.65,-84.29,33.89");
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "1");

  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Mapbox geocode failed: ${response.status}`);

  const parsed = mapboxResponseSchema.parse(await response.json());
  const center = parsed.features[0]?.center;
  const result: GeocodeResult = center
    ? { longitude: center[0], latitude: center[1], status: "ok" }
    : { latitude: null, longitude: null, status: "failed" };

  cache.set(normalized, result);
  return result;
}
