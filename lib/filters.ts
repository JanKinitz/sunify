// Filter-Standardwerte und (De-)Serialisierung in URL-Query-Parameter ("Suche teilen").

import { DEFAULT_ORIGIN, POPULAR_ORIGINS } from "./origins";
import { seasonalNormals } from "./season";
import { clampToForecast, isValidISO, rangeForPreset } from "./dates";
import { CATEGORIES } from "./categories";
import { tr } from "./i18n";
import { RADIUS_MAX, RADIUS_MIN } from "./search";
import type { Category, DatePreset, Filters, PrecipMode, Tolerance } from "./types";

export const TEMP_MIN = -5;
export const TEMP_MAX = 35;
export const WIND_MIN = 5;
export const WIND_MAX = 60;
export const SUN_MAX = 12;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Jahreszeitlich sinnvolle Startwerte, damit die erste Suche realistische Treffer zeigt. */
export function defaultFilters(): Filters {
  const normals = seasonalNormals();
  return {
    origin: DEFAULT_ORIGIN,
    radiusKm: 200,
    datePreset: "weekend",
    ...rangeForPreset("weekend"),
    minTemp: Math.round(normals.tempMax + 1),
    precipMode: "almost",
    maxWind: 30,
    minSun: Math.round(normals.maxSun * 0.4),
    category: "all",
    tolerance: 0,
  };
}

const PRESETS: DatePreset[] = ["weekend", "nextWeekend", "tomorrow", "custom"];
const PRECIP: PrecipMode[] = ["dry", "almost", "any"];

export function filtersToQuery(filters: Filters): string {
  const q = new URLSearchParams();
  if (filters.origin.id === "gps" || !POPULAR_ORIGINS.some((o) => o.id === filters.origin.id)) {
    // Eigener oder gesuchter Standort: gerundete Koordinaten in den Link schreiben (~1 km genau).
    // Der Name wird nur bei gesuchten Orten übernommen, nicht beim GPS-Standort.
    q.set("lat", filters.origin.lat.toFixed(2));
    q.set("lon", filters.origin.lon.toFixed(2));
    if (filters.origin.id !== "gps") q.set("n", filters.origin.name);
  } else {
    q.set("o", filters.origin.id);
  }
  q.set("r", String(filters.radiusKm));
  q.set("d", filters.datePreset);
  if (filters.datePreset === "custom") {
    q.set("s", filters.startDate);
    q.set("e", filters.endDate);
  }
  q.set("t", String(filters.minTemp));
  q.set("p", filters.precipMode);
  q.set("w", String(filters.maxWind));
  q.set("sun", String(filters.minSun));
  q.set("c", filters.category);
  if (filters.tolerance > 0) q.set("tol", String(filters.tolerance));
  return q.toString();
}

export function filtersFromQuery(search: string): Filters {
  const base = defaultFilters();
  const q = new URLSearchParams(search);
  if ([...q.keys()].length === 0) return base;

  const num = (key: string, fallback: number, min: number, max: number) => {
    const raw = q.get(key);
    if (raw === null || raw === "") return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? clamp(Math.round(v), min, max) : fallback;
  };

  let origin = base.origin;
  const originId = q.get("o");
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  if (originId) {
    origin = POPULAR_ORIGINS.find((o) => o.id === originId) ?? base.origin;
  } else if (q.get("lat") && q.get("lon") && Number.isFinite(lat) && Number.isFinite(lon)) {
    const name = (q.get("n") ?? "").trim().slice(0, 80);
    origin = name ? { id: `geo:${name}`, name, lat, lon } : { id: "gps", name: tr("Geteilter Standort"), lat, lon };
  }

  const presetRaw = q.get("d") as DatePreset | null;
  const datePreset = presetRaw && PRESETS.includes(presetRaw) ? presetRaw : base.datePreset;
  let { startDate, endDate } = base;
  if (datePreset === "custom") {
    const s = q.get("s");
    const e = q.get("e");
    if (isValidISO(s) && isValidISO(e)) {
      startDate = clampToForecast(s);
      endDate = clampToForecast(e);
      if (endDate < startDate) endDate = startDate;
    }
  } else {
    ({ startDate, endDate } = rangeForPreset(datePreset));
  }

  const precipRaw = q.get("p") as PrecipMode | null;
  const categoryRaw = q.get("c") as Category | null;

  return {
    origin,
    radiusKm: num("r", base.radiusKm, RADIUS_MIN, RADIUS_MAX),
    datePreset,
    startDate,
    endDate,
    minTemp: num("t", base.minTemp, TEMP_MIN, TEMP_MAX),
    precipMode: precipRaw && PRECIP.includes(precipRaw) ? precipRaw : base.precipMode,
    maxWind: num("w", base.maxWind, WIND_MIN, WIND_MAX),
    minSun: num("sun", base.minSun, 0, SUN_MAX),
    category: categoryRaw && CATEGORIES.includes(categoryRaw) ? categoryRaw : base.category,
    tolerance: num("tol", 0, 0, 2) as Tolerance,
  };
}
