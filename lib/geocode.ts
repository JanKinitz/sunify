// Live-Geocoding für das Startort-Feld über die kostenlose Photon-API (OpenStreetMap-Daten,
// kein API-Key), weltweit. Wird direkt aus dem Browser aufgerufen.

import { getLocale } from "./i18n";
import type { Origin } from "./types";

const PHOTON_URL = "https://photon.komoot.io/api/";
/** Photon-Ergebnistypen, die als Startort taugen (keine Straßen, Häuser, Landkreise) */
const PLACE_TYPES = new Set(["city", "district", "locality"]);

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    state?: string;
    county?: string;
    country?: string;
  };
}

export async function geocodePlaces(query: string, signal?: AbortSignal): Promise<Origin[]> {
  // weltweit; Ortsnamen in der gewählten Sprache
  const params = new URLSearchParams({ q: query, lang: getLocale(), limit: "12" });
  const response = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
  const data = (await response.json()) as { features?: PhotonFeature[] };

  const seen = new Set<string>();
  const origins: Origin[] = [];
  for (const feature of data.features ?? []) {
    const p = feature.properties;
    const coords = feature.geometry?.coordinates;
    if (!p?.name || !coords) continue;
    if (p.osm_key !== "place" && p.osm_key !== "boundary") continue;
    if (!PLACE_TYPES.has(p.type ?? "")) continue;
    const detail = [p.state ?? p.county, p.country].filter(Boolean).join(", ");
    const key = `${p.name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    origins.push({
      id: `geo:${p.osm_id ?? key}`,
      name: p.name,
      detail,
      lat: coords[1],
      lon: coords[0],
    });
    if (origins.length >= 6) break;
  }
  return origins;
}
