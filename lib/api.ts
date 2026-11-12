// Client-Anbindung an POST /api/search. Wandelt die API-Antwort in die UI-Typen um.

import { getLocale, tr, trn } from "./i18n";
import type { Relaxation } from "./search";
import { maxPrecipFor } from "./search";
import type { DailyForecast, Destination, Filters, TagKey } from "./types";

/** Maximale Trefferzahl in Liste und Karte (zugleich das Maximum der API). */
export const RESULT_LIMIT = 100;

interface ApiDestination {
  id: number;
  name: string;
  nameDe: string | null;
  nameEn: string | null;
  countryCode: string;
  adminRegion: string | null;
  adminRegionDe: string | null;
  adminRegionEn: string | null;
  lat: number;
  lon: number;
  elevation: number | null;
  population: number;
  tourismScore: number;
  tags: string[];
  gridId: number;
  tempCorrection: number;
  image: { file: string; author: string; license: string } | null;
}

interface ApiDaily {
  date: string;
  tempMax: number;
  tempMin: number;
  precip: number;
  precipProb: number | null;
  wind: number;
  sunshine: number | null;
  weatherCode: number;
}

interface ApiResponse {
  matches: { id: number; pct: number; strict: boolean }[];
  totalMatches: number;
  otherIds: number[];
  destinations: ApiDestination[];
  forecasts: Record<string, ApiDaily[]>;
  relaxations: Relaxation[];
  meta: { tookMs: number; weatherUpdatedAt: string | null };
}

export interface SearchData {
  /** Die Filter, mit denen diese Antwort berechnet wurde */
  filters: Filters;
  matchIds: number[];
  matchInfo: Record<number, { pct: number; strict: boolean }>;
  totalMatches: number;
  otherIds: number[];
  destinations: Destination[];
  relaxations: Relaxation[];
  weatherUpdatedAt: string | null;
}

const KNOWN_TAGS: TagKey[] = ["mountains", "hiking", "lake", "coast", "historic", "wine", "culture", "wellness"];

const TAG_LABEL: Record<TagKey, string> = {
  mountains: "Berge",
  hiking: "Wandern",
  lake: "See",
  coast: "Küste",
  historic: "Altstadt",
  wine: "Wein",
  culture: "Kultur",
  wellness: "Wellness",
};

const TAG_PHRASE: Record<TagKey, string> = {
  mountains: "Bergpanorama",
  hiking: "Wanderwege",
  lake: "Seeufer",
  coast: "Strand und Meer",
  historic: "historische Altstadt",
  wine: "Weinberge",
  culture: "Kultur",
  wellness: "Thermen und Wellness",
};

const TAG_EMOJI: Record<TagKey, string> = {
  mountains: "⛰️",
  hiking: "🥾",
  lake: "⛵",
  coast: "🌊",
  historic: "🏰",
  wine: "🍇",
  culture: "🎭",
  wellness: "♨️",
};

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames([getLocale()], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function teaserFor(tags: TagKey[], region: string, population: number): string {
  if (tags.length === 0) {
    return population > 0
      ? trn(population, "Ort in {region} · 1 Einwohner", "Ort in {region} · {n} Einwohner", { region })
      : tr("Ort in {region}", { region });
  }
  const phrases = tags.slice(0, 3).map((t) => tr(TAG_PHRASE[t]));
  const and = tr("und");
  const text = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(", ")} ${and} ${phrases[phrases.length - 1]}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function toDestination(api: ApiDestination, days: ApiDaily[]): Destination {
  const en = getLocale() === "en";
  const tags = api.tags.filter((t): t is TagKey => (KNOWN_TAGS as string[]).includes(t));
  const name = (en ? api.nameEn : api.nameDe) ?? api.name;
  const region =
    (en ? api.adminRegionEn : api.adminRegionDe) ?? api.adminRegion ?? countryName(api.countryCode);
  const corr = api.tempCorrection || 0;
  const forecasts: DailyForecast[] = days.map((d) => ({
    date: d.date,
    tempMax: Math.round((d.tempMax + corr) * 10) / 10,
    tempMin: Math.round((d.tempMin + corr) * 10) / 10,
    precip: d.precip,
    precipProb: d.precipProb,
    wind: Math.round(d.wind),
    sunshine: d.sunshine ?? 0,
    weatherCode: d.weatherCode,
  }));
  return {
    id: api.id,
    name,
    countryCode: api.countryCode,
    adminRegion: region,
    area: region,
    lat: api.lat,
    lon: api.lon,
    elevation: api.elevation,
    population: api.population,
    tourismScore: api.tourismScore,
    tags,
    hashtags: tags.slice(0, 3).map((t) => tr(TAG_LABEL[t])),
    teaser: teaserFor(tags, region, api.population),
    emoji: tags.length > 0 ? TAG_EMOJI[tags[0]] : "📍",
    image: api.image,
    tempCorrection: corr,
    forecasts,
    gridId: api.gridId,
  };
}

export class SearchError extends Error {}

export async function fetchSearch(filters: Filters, favoriteIds: number[], signal?: AbortSignal): Promise<SearchData> {
  const maxPrecip = maxPrecipFor(filters.precipMode);
  let response: Response;
  try {
    response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        originLat: filters.origin.lat,
        originLon: filters.origin.lon,
        radiusKm: filters.radiusKm,
        startDate: filters.startDate,
        endDate: filters.endDate,
        criteria: {
          minTempMax: filters.minTemp,
          maxPrecipitationSum: Number.isFinite(maxPrecip) ? maxPrecip : null,
          maxWindSpeed: filters.maxWind,
          minSunshineHours: filters.minSun,
        },
        tolerance: filters.tolerance,
        category: filters.category,
        limit: RESULT_LIMIT,
        favoriteIds,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new SearchError(tr("Der Server ist nicht erreichbar."));
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    throw new SearchError(tr("Die Suche ist gerade nicht verfügbar."));
  }
  const api = payload as ApiResponse;

  return {
    filters,
    matchIds: api.matches.map((m) => m.id),
    matchInfo: Object.fromEntries(api.matches.map((m) => [m.id, { pct: m.pct, strict: m.strict }])),
    totalMatches: api.totalMatches,
    otherIds: api.otherIds,
    destinations: api.destinations.map((d) => toDestination(d, api.forecasts[String(d.gridId)] ?? [])),
    relaxations: api.relaxations,
    weatherUpdatedAt: api.meta?.weatherUpdatedAt ?? null,
  };
}
