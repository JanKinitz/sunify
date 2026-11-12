// Tourismus-Score-Berechnung (Kapitel 6.1, Schritt 4) und Abgleich mit der kuratierten Liste.
// Ziel: charmante Urlaubsorte vor reinen Industrie- und Großstädten listen.

import { CURATED_DESTINATIONS, type CuratedDestination, type DestinationTag } from "../data/curatedDestinations";
import type { Place } from "./geonames";
import { haversineKm } from "./grid";

export interface SeedDestination {
  name: string;
  countryCode: string;
  adminRegion: string | null;
  lat: number;
  lon: number;
  population: number;
  elevation: number | null;
  tourismScore: number;
  tags: DestinationTag[];
}

const MAX_HEURISTIC_SCORE = 68; // kuratierte Ziele beginnen darüber
const MATCH_RADIUS_KM = 8;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bsankt\b/g, "st")
    .replace(/[^a-z0-9]/g, "");
}

/** Heuristischer Score (0–68) für Orte ohne kuratierten Eintrag. */
export function heuristicScore(place: Place): { score: number; tags: DestinationTag[] } {
  const tags = new Set<DestinationTag>();
  let score = 38;

  // Einwohnerzahl: Klein- und Mittelstädte sind die typischen Ausflugsziele
  const pop = place.population;
  if (pop >= 600000) score += 8;
  else if (pop >= 250000) score += 5;
  else if (pop >= 60000) score += 7;
  else if (pop >= 8000) score += 10;
  else if (pop >= 2000) score += 6;

  // Höhenlage: Mittelgebirge und Alpen
  const elevation = place.elevation ?? 0;
  if (elevation >= 1000) {
    score += 12;
    tags.add("mountains").add("hiking");
  } else if (elevation >= 600) {
    score += 7;
    tags.add("mountains").add("hiking");
  }

  // Namenshinweise
  if (/^Bad /.test(place.name)) {
    score += 10;
    tags.add("wellness");
  }
  if (/( am See|see)$/.test(place.name) || / am .*[Ss]ee\b/.test(place.name)) {
    score += 8;
    tags.add("lake");
  }
  if (/(Weinstraße| an der Mosel|Mosel$)/.test(place.name)) {
    score += 6;
    tags.add("wine");
  }

  // Landes- und Regionalhauptstädte bieten meist Altstadt und Kultur
  if (place.featureCode === "PPLC" || place.featureCode === "PPLA") {
    score += 5;
    tags.add("culture");
  }

  return { score: clamp(Math.round(score), 0, MAX_HEURISTIC_SCORE), tags: [...tags] };
}

function findMatch(curated: CuratedDestination, places: Place[], taken: Set<number>): number {
  const key = normalizeName(curated.name).slice(0, 6);
  let best = -1;
  let bestRank = -Infinity;
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (taken.has(i) || p.countryCode !== curated.countryCode) continue;
    // Grobe Vorauswahl ohne Trigonometrie
    if (Math.abs(p.lat - curated.lat) > 0.12 || Math.abs(p.lon - curated.lon) > 0.2) continue;
    const distance = haversineKm(curated.lat, curated.lon, p.lat, p.lon);
    if (distance > MATCH_RADIUS_KM) continue;
    if (!normalizeName(p.name).startsWith(key)) continue;
    // Bevorzugt: exakt gleicher Name, dann der größere bzw. nähere Ort
    const exact = normalizeName(p.name) === normalizeName(curated.name) ? 1000 : 0;
    const rank = exact + Math.log10(p.population + 10) * 10 - distance;
    if (rank > bestRank) {
      bestRank = rank;
      best = i;
    }
  }
  return best;
}

export interface BuildResult {
  destinations: SeedDestination[];
  curatedMatched: number;
  curatedAdded: string[];
}

/** Führt GeoNames-Orte und kuratierte Ziele zu einer Seed-Liste zusammen. */
export function buildDestinations(
  places: Place[],
  curatedList: CuratedDestination[] = CURATED_DESTINATIONS
): BuildResult {
  const destinations: SeedDestination[] = places.map((p) => {
    const { score, tags } = heuristicScore(p);
    return {
      name: p.name,
      countryCode: p.countryCode,
      adminRegion: p.adminRegion,
      lat: p.lat,
      lon: p.lon,
      population: p.population,
      elevation: p.elevation,
      tourismScore: score,
      tags,
    };
  });

  const taken = new Set<number>();
  const curatedAdded: string[] = [];
  let curatedMatched = 0;

  for (const curated of curatedList) {
    const index = findMatch(curated, places, taken);
    if (index >= 0) {
      taken.add(index);
      curatedMatched++;
      const target = destinations[index];
      target.tourismScore = curated.score;
      target.tags = curated.tags;
      target.adminRegion = target.adminRegion ?? curated.region;
    } else {
      // Ort fehlt in GeoNames (oder heißt dort anders): mit kuratierten Daten ergänzen
      curatedAdded.push(curated.name);
      destinations.push({
        name: curated.name,
        countryCode: curated.countryCode,
        adminRegion: curated.region,
        lat: curated.lat,
        lon: curated.lon,
        population: curated.population,
        elevation: null,
        tourismScore: curated.score,
        tags: curated.tags,
      });
    }
  }

  return { destinations, curatedMatched, curatedAdded };
}
