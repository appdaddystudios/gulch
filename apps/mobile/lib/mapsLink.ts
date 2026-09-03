// URL builders for "open this venue in a maps app". Pure — no React Native —
// so every branch is unit-tested; lib/openInMaps.ts does the platform work.

export type MapsProvider = "apple" | "google";

export type MapsTarget = {
  readonly name: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
};

// Events without geocoded venues still get a useful search: the venue name
// scoped to the city the magazine covers.
const SEARCH_CITY = "Atlanta";

const hasCoords = (
  target: MapsTarget,
): target is MapsTarget & { latitude: number; longitude: number } =>
  target.latitude !== null && target.longitude !== null;

const searchQuery = (target: MapsTarget): string =>
  encodeURIComponent(`${target.name} ${SEARCH_CITY}`);

const coords = (target: MapsTarget & { latitude: number; longitude: number }) =>
  `${target.latitude},${target.longitude}`;

// Apple Maps URL scheme: `q` labels the pin, `ll` places it.
export const appleMapsUrl = (target: MapsTarget): string =>
  hasCoords(target)
    ? `maps://?q=${encodeURIComponent(target.name)}&ll=${coords(target)}`
    : `maps://?q=${searchQuery(target)}`;

// Google Maps iOS app scheme.
export const googleMapsAppUrl = (target: MapsTarget): string =>
  hasCoords(target)
    ? `comgooglemaps://?q=${coords(target)}(${encodeURIComponent(target.name)})`
    : `comgooglemaps://?q=${searchQuery(target)}`;

// Universal link — opens the Google Maps app when installed, the web app
// otherwise, so it doubles as the fallback when the scheme can't be queried.
export const googleMapsWebUrl = (target: MapsTarget): string =>
  hasCoords(target)
    ? `https://www.google.com/maps/search/?api=1&query=${coords(target)}`
    : `https://www.google.com/maps/search/?api=1&query=${searchQuery(target)}`;

// Android `geo:` intent — the system picks the user's default maps app.
export const geoIntentUrl = (target: MapsTarget): string =>
  hasCoords(target)
    ? `geo:${coords(target)}?q=${coords(target)}(${encodeURIComponent(target.name)})`
    : `geo:0,0?q=${searchQuery(target)}`;
