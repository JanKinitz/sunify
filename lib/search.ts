// Client-seitige Auswertung der Suchergebnisse: Tages-Nachweis (inkl. Toleranzbereich), Kennzahlen,
// Sortierung und Fahrzeit. Die eigentliche Suche läuft in der Datenbank (search_destinations_v2).

import { anyTemp, anyWind, TOLERANCE_SLACK } from "./categories";
import { diffDays, todayISO, weekdayShort } from "./dates";
import { fmtPrecip, fmtSpeed, fmtTempSpaced, formatNumber, tr } from "./i18n";
import type {
  CheckState,
  DailyForecast,
  DayCheck,
  Destination,
  Filters,
  PrecipMode,
  SearchResult,
  SortKey,
  Tolerance,
} from "./types";

export { CATEGORY_TAGS } from "./categories";

export const RADIUS_MIN = 50;
export const RADIUS_MAX = 500;
export const RADIUS_STEP = 10;

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
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Grobe Fahrzeit-Schätzung: Luftlinie × Umwegfaktor bei Ø 80 km/h. */
export function estimateDriveMinutes(distanceKm: number): number {
  return Math.round(((distanceKm * 1.28) / 80) * 60);
}

export function formatDriveTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / 5) * 5;
  if (h === 0) return tr("{m} Min.", { m: Math.max(5, m) });
  if (m === 0 || m === 60) return tr("{h} Std.", { h: m === 60 ? h + 1 : h });
  return tr("{h} Std. {m} Min.", { h, m });
}

function state(exact: boolean, loose: boolean): CheckState {
  return exact ? "ok" : loose ? "near" : "fail";
}

/** Prüft einen Tag gegen die Filter: exakt erfüllt, im Toleranzbereich oder verfehlt. */
export function checkDay(day: DailyForecast, filters: Filters, tolerance: Tolerance = filters.tolerance): DayCheck {
  const slack = TOLERANCE_SLACK[tolerance];
  const maxP = maxPrecipFor(filters.precipMode);
  const minT = anyTemp(filters.minTemp) ? Number.NEGATIVE_INFINITY : filters.minTemp;
  const maxW = anyWind(filters.maxWind) ? Number.POSITIVE_INFINITY : filters.maxWind;
  const temp = state(day.tempMax >= minT, day.tempMax >= minT - slack.temp);
  const precip = state(day.precip <= maxP, day.precip <= maxP + slack.precip);
  const wind = state(day.wind <= maxW, day.wind <= maxW + slack.wind);
  const sun = state(day.sunshine >= filters.minSun, day.sunshine >= filters.minSun - slack.sun);
  const all = [temp, precip, wind, sun];
  return { day, temp, precip, wind, sun, allOk: all.every((s) => s === "ok"), allNear: all.every((s) => s !== "fail") };
}

/**
 * Warum ein Fast-Treffer kein voller Treffer ist – kurze Gründe für die Ergebnisliste,
 * z. B. „Sa: 19 °C statt mind. 20 °C“. Liefert höchstens `max` Einträge (je abweichendem Tag ein Grund).
 */
export function nearMissReasons(result: SearchResult, filters: Filters, max = 2): string[] {
  const reasons: string[] = [];
  const maxP = maxPrecipFor(filters.precipMode);
  for (const day of result.days) {
    if (reasons.length >= max) break;
    const c = checkDay(day, filters);
    if (c.allOk) continue;
    const wd = weekdayShort(day.date);
    if (c.temp !== "ok") {
      reasons.push(tr("{day}: {value} statt mind. {target}", { day: wd, value: fmtTempSpaced(day.tempMax), target: fmtTempSpaced(filters.minTemp) }));
    } else if (c.precip !== "ok") {
      reasons.push(tr("{day}: {value} Regen statt max. {target}", { day: wd, value: fmtPrecip(day.precip), target: fmtPrecip(maxP) }));
    } else if (c.wind !== "ok") {
      reasons.push(tr("{day}: {value} Wind statt max. {target}", { day: wd, value: fmtSpeed(day.wind), target: fmtSpeed(filters.maxWind) }));
    } else if (c.sun !== "ok") {
      reasons.push(tr("{day}: {value} Std. Sonne statt mind. {target}", { day: wd, value: formatNumber(day.sunshine), target: formatNumber(filters.minSun) }));
    }
  }
  return reasons;
}

/** Ab dem 8. Prognosetag (heute = Tag 1) sind Vorhersagen deutlich unsicherer. */
export const UNCERTAIN_FROM_DAY = 8;

export function isUncertainDay(iso: string): boolean {
  return diffDays(todayISO(), iso) >= UNCERTAIN_FROM_DAY - 1;
}

export function daysInRange(destination: Destination, startDate: string, endDate: string) {
  return destination.forecasts.filter((f) => f.date >= startDate && f.date <= endDate);
}

/** Beschreibt einen Ort für Liste, Karte und Detailansicht (auch Nicht-Treffer). */
export function describeDestination(
  destination: Destination,
  filters: Filters,
  match?: { pct: number; strict: boolean }
): SearchResult {
  const days = daysInRange(destination, filters.startDate, filters.endDate);
  const n = Math.max(1, days.length);
  const distanceKm = Math.round(haversineKm(filters.origin.lat, filters.origin.lon, destination.lat, destination.lon));
  return {
    destination,
    distanceKm,
    driveMinutes: estimateDriveMinutes(distanceKm),
    days,
    avgTempMax: Math.round((days.reduce((s, d) => s + d.tempMax, 0) / n) * 10) / 10,
    totalPrecip: Math.round(days.reduce((s, d) => s + d.precip, 0) * 10) / 10,
    maxWind: days.reduce((m, d) => Math.max(m, d.wind), 0),
    avgSunshine: Math.round((days.reduce((s, d) => s + d.sunshine, 0) / n) * 10) / 10,
    matchPct: match?.pct,
    strict: match?.strict,
  };
}

export function sortResults(results: SearchResult[], sort: SortKey): SearchResult[] {
  const sorted = [...results];
  sorted.sort((a, b) => {
    // Volle Treffer stehen immer vor Fast-Treffern
    const strictDiff = Number(b.strict !== false) - Number(a.strict !== false);
    if (strictDiff !== 0) return strictDiff;
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
          (b.matchPct ?? 100) - (a.matchPct ?? 100) ||
          b.destination.tourismScore - a.destination.tourismScore ||
          b.avgTempMax - a.avgTempMax ||
          b.destination.population - a.destination.population
        );
    }
  });
  return sorted;
}

// ---------------------------------------------------------------------------
// Smart Empty State: "Fast-Treffer"-Vorschläge (Werte vom Server, Texte im Client)
// ---------------------------------------------------------------------------

export interface Relaxation {
  id: "radius" | "temp" | "tolerance" | "precip" | "sun" | "wind" | "category";
  count: number;
  patch: Partial<Filters>;
}
