// Client-seitige Such- und Filterlogik für Phase 0.
// Bildet die SQL-Kernlogik aus Kapitel 7 nach ("Alle-Tage-müssen-passen"):
// Ein Ort ist nur dann ein Treffer, wenn JEDER Tag im Zeitraum ALLE Kriterien erfüllt.

import type {
  Category,
  DailyForecast,
  DayCheck,
  Destination,
  Filters,
  PrecipMode,
  SearchResult,
  SortKey,
  TagKey,
} from "./types";

export const RADIUS_MIN = 50;
export const RADIUS_MAX = 500;
export const RADIUS_STEP = 10;

export const CATEGORY_TAGS: Record<Exclude<Category, "all">, TagKey[]> = {
  mountains: ["mountains", "hiking"],
  water: ["lake", "coast"],
  historic: ["historic", "culture"],
  wine: ["wine"],
};

export function maxPrecipFor(mode: PrecipMode): number {
  if (mode === "dry") return 0;
  if (mode === "almost") return 1;
  return Number.POSITIVE_INFINITY;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Grobe Fahrzeit-Schätzung: Luftlinie × Umwegfaktor bei Ø 80 km/h. */
export function estimateDriveMinutes(distanceKm: number): number {
  return Math.round(((distanceKm * 1.28) / 80) * 60);
}

export function formatDriveTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / 5) * 5;
  if (h === 0) return `${Math.max(5, m)} Min.`;
  if (m === 0 || m === 60) return `${m === 60 ? h + 1 : h} Std.`;
  return `${h} Std. ${m} Min.`;
}

export function matchesCategory(destination: Destination, category: Category): boolean {
  if (category === "all") return true;
  return CATEGORY_TAGS[category].some((tag) => destination.tags.includes(tag));
}

export function checkDay(day: DailyForecast, filters: Filters): DayCheck {
  const tempOk = day.tempMax >= filters.minTemp;
  const precipOk = day.precip <= maxPrecipFor(filters.precipMode);
  const windOk = day.wind <= filters.maxWind;
  const sunOk = day.sunshine >= filters.minSun;
  return { day, tempOk, precipOk, windOk, sunOk, allOk: tempOk && precipOk && windOk && sunOk };
}

export function daysInRange(destination: Destination, startDate: string, endDate: string) {
  return destination.forecasts.filter((f) => f.date >= startDate && f.date <= endDate);
}

function distanceTo(destination: Destination, filters: Filters) {
  return haversineKm(filters.origin.lat, filters.origin.lon, destination.lat, destination.lon);
}

function toResult(destination: Destination, filters: Filters): SearchResult {
  const days = daysInRange(destination, filters.startDate, filters.endDate);
  const n = Math.max(1, days.length);
  const distanceKm = Math.round(distanceTo(destination, filters));
  return {
    destination,
    distanceKm,
    driveMinutes: estimateDriveMinutes(distanceKm),
    days,
    avgTempMax: Math.round((days.reduce((s, d) => s + d.tempMax, 0) / n) * 10) / 10,
    totalPrecip: Math.round(days.reduce((s, d) => s + d.precip, 0) * 10) / 10,
    maxWind: days.reduce((m, d) => Math.max(m, d.wind), 0),
    avgSunshine: Math.round((days.reduce((s, d) => s + d.sunshine, 0) / n) * 10) / 10,
  };
}

/** Beschreibt einen beliebigen Ort für die Detailansicht (auch Nicht-Treffer). */
export function describeDestination(destination: Destination, filters: Filters): SearchResult {
  return toResult(destination, filters);
}

export function isMatch(destination: Destination, filters: Filters): boolean {
  if (!matchesCategory(destination, filters.category)) return false;
  if (distanceTo(destination, filters) > filters.radiusKm) return false;
  const days = daysInRange(destination, filters.startDate, filters.endDate);
  if (days.length === 0) return false;
  return days.every((d) => checkDay(d, filters).allOk);
}

export function searchDestinations(destinations: Destination[], filters: Filters): SearchResult[] {
  return destinations.filter((d) => isMatch(d, filters)).map((d) => toResult(d, filters));
}

/** Orte im Radius, die die Wetterkriterien NICHT erfüllen (für gedimmte Karten-Marker). */
export function nonMatchingInRadius(destinations: Destination[], filters: Filters): SearchResult[] {
  return destinations
    .filter((d) => distanceTo(d, filters) <= filters.radiusKm && !isMatch(d, filters))
    .map((d) => toResult(d, filters));
}

export function sortResults(results: SearchResult[], sort: SortKey): SearchResult[] {
  const sorted = [...results];
  sorted.sort((a, b) => {
    switch (sort) {
      case "temp":
        return b.avgTempMax - a.avgTempMax;
      case "sun":
        return b.avgSunshine - a.avgSunshine;
      case "distance":
        return a.distanceKm - b.distanceKm;
      case "population":
        return b.destination.population - a.destination.population;
      default:
        return (
          b.destination.tourismScore - a.destination.tourismScore ||
          b.avgTempMax - a.avgTempMax ||
          b.destination.population - a.destination.population
        );
    }
  });
  return sorted;
}

// ---------------------------------------------------------------------------
// Smart Empty State: "Fast-Treffer"-Vorschläge mit 1-Klick-Filterlockerung
// ---------------------------------------------------------------------------

export interface Relaxation {
  id: string;
  label: string;
  hint: string;
  count: number;
  patch: Partial<Filters>;
}

export function findRelaxations(destinations: Destination[], filters: Filters): Relaxation[] {
  const count = (patch: Partial<Filters>) =>
    searchDestinations(destinations, { ...filters, ...patch }).length;
  const out: Relaxation[] = [];
  const add = (id: string, label: string, hint: (n: number) => string, patch: Partial<Filters>) => {
    const n = count(patch);
    if (n > 0) out.push({ id, label, hint: hint(n), count: n, patch });
  };
  const orte = (n: number) => (n === 1 ? "1 Ort" : `${n} Orte`);
  const passt = (n: number) => (n === 1 ? "1 Ort passt dann" : `${n} Orte passen dann`);

  // 1) Radius um +100 km erweitern (ggf. weiter, bis Treffer auftauchen)
  for (const extra of [100, 200, 300]) {
    const radius = Math.min(RADIUS_MAX, filters.radiusKm + extra);
    if (radius <= filters.radiusKm) break;
    const n = count({ radiusKm: radius });
    if (n > 0) {
      out.push({
        id: "radius",
        label: `Suchradius auf ${radius} km erweitern`,
        hint: `${orte(n)} gefunden!`,
        count: n,
        patch: { radiusKm: radius },
      });
      break;
    }
  }

  // 2) Temperatur um 2 °C senken – falls das nicht reicht, bis zum ersten Wert mit Treffern
  for (let minTemp = filters.minTemp - 2; minTemp >= -5; minTemp--) {
    const n = count({ minTemp });
    if (n > 0) {
      out.push({
        id: "temp",
        label: `Temperatur auf ≥ ${minTemp} °C senken`,
        hint: `${orte(n)} im ${filters.radiusKm}-km-Radius!`,
        count: n,
        patch: { minTemp },
      });
      break;
    }
  }

  // 3) Niederschlag lockern
  if (filters.precipMode === "dry") {
    add("precip", "„Fast trocken“ (≤ 1 mm) erlauben", (n) => passt(n), {
      precipMode: "almost",
    });
  } else if (filters.precipMode === "almost") {
    add("precip", "Regen ist mir egal", (n) => passt(n), { precipMode: "any" });
  }

  // 4) Sonnenstunden lockern
  if (filters.minSun >= 2) {
    const minSun = Math.max(0, filters.minSun - 2);
    add("sun", `Sonne auf ≥ ${minSun} Std. senken`, (n) => passt(n), { minSun });
  }

  // 5) Wind lockern
  if (filters.maxWind <= 50) {
    const maxWind = filters.maxWind + 10;
    add("wind", `Wind bis ${maxWind} km/h erlauben`, (n) => passt(n), { maxWind });
  }

  // 6) Orts-Charakter öffnen
  if (filters.category !== "all") {
    add("category", "Alle Orts-Typen anzeigen", (n) => passt(n), {
      category: "all",
    });
  }

  return out;
}
