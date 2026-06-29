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
};

const mapboxResponseSchema = z
  .object({
    features: z.array(
      z
        .object({
          center: z.tuple([z.number(), z.number()])
        })
        .passthrough()
    )
  })
  .passthrough();

export function createGeocoder(options: GeocoderOptions): Geocoder {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const cache = options.cache ?? new Map<string, GeocodeResult>();

  return {
    async geocode(address) {
      const key = normalizeAddress(address);
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }

      const response = await fetchImpl(buildGeocodeUrl(address, options.token));
      if (!response.ok) {
        throw new Error(`Mapbox geocode failed with status ${response.status}`);
      }

      const parsed = mapboxResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
        throw new Error(`Invalid Mapbox geocode response: ${details}`);
      }

      const [longitude, latitude] = parsed.data.features[0]?.center ?? [];
      const result: GeocodeResult =
        longitude === undefined || latitude === undefined
          ? { latitude: null, longitude: null, status: "failed" }
          : { latitude, longitude, status: "ok" };
      cache.set(key, result);

      return result;
    }
  };
}

function normalizeAddress(address: string): string {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildGeocodeUrl(address: string, token: string): URL {
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("proximity", "-84.39,33.75");
  url.searchParams.set("bbox", "-84.55,33.65,-84.29,33.89");
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "us");
  return url;
}
