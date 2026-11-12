// Phase 3 · Rückwärtssuche auf der eigenen Datenbank (Kapitel 7 der Spezifikation).
// Validiert die Filter, ruft die PostGIS-Funktion search_weather_destinations auf und liefert
// zusätzlich alles, was das in Phase 0 abgenommene UI braucht: Nicht-Treffer für die Karte,
// 14-Tage-Prognosen je Rasterpunkt (Detail-Timeline), Merklisten-Orte und "Fast-Treffer".
// Es findet KEIN externer Wetter-API-Call statt.

import { CATEGORY_TAGS } from "@/lib/search";
import type { Category, PrecipMode } from "@/lib/types";
import type { Queryable } from "./weatherSync";

export interface SearchRequest {
  originLat: number;
  originLon: number;
  radiusKm: number;
  startDate: string;
  endDate: string;
  minTemp: number;
  /** null = Niederschlag egal */
  maxPrecip: number | null;
  maxWind: number;
  minSun: number;
  category: Category;
  limit: number;
  favoriteIds: number[];
}

export interface ApiDestination {
  id: number;
  name: string;
  countryCode: string;
  adminRegion: string | null;
  lat: number;
  lon: number;
  population: number;
  tourismScore: number;
  tags: string[];
  gridId: number;
}

export interface ApiDaily {
  date: string;
  tempMax: number;
  tempMin: number;
  precip: number;
  precipProb: number | null;
  wind: number;
  sunshine: number | null;
  weatherCode: number;
}

export interface ApiRelaxation {
  id: string;
  label: string;
  hint: string;
  count: number;
  patch: {
    radiusKm?: number;
    minTemp?: number;
    precipMode?: PrecipMode;
    minSun?: number;
    maxWind?: number;
    category?: Category;
  };
}

export interface SearchResponse {
  matchIds: number[];
  totalMatches: number;
  otherIds: number[];
  destinations: ApiDestination[];
  forecasts: Record<string, ApiDaily[]>;
  relaxations: ApiRelaxation[];
  meta: { tookMs: number; weatherUpdatedAt: string | null };
}

const RADIUS_MIN = 10;
const RADIUS_MAX = 500;
const LIMIT_MAX = 100;
const NO_LIMIT = 100000;
const ANY_PRECIP = 100000;
const OTHERS_LIMIT = 40;
const OTHERS_MIN_SCORE = 72; // nur bekannte Ausflugsziele als gedimmte Punkte zeigen
const CATEGORIES: Category[] = ["all", "mountains", "water", "historic", "wine"];

// ---------------------------------------------------------------------------
// Validierung
// ---------------------------------------------------------------------------

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

function num(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

export function parseSearchRequest(
  body: unknown
): { ok: true; value: SearchRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "JSON-Objekt erwartet." };
  const b = body as Record<string, unknown>;
  const criteria = (typeof b.criteria === "object" && b.criteria !== null ? b.criteria : {}) as Record<string, unknown>;

  const originLat = num(b.originLat, -90, 90);
  const originLon = num(b.originLon, -180, 180);
  if (originLat === null || originLon === null) return { ok: false, error: "originLat/originLon fehlen oder sind ungültig." };

  const radiusKm = num(b.radiusKm, RADIUS_MIN, RADIUS_MAX);
  if (radiusKm === null) return { ok: false, error: `radiusKm muss zwischen ${RADIUS_MIN} und ${RADIUS_MAX} liegen.` };

  if (!isIsoDate(b.startDate) || !isIsoDate(b.endDate)) return { ok: false, error: "startDate/endDate im Format YYYY-MM-DD erwartet." };
  const span = dayDiff(b.startDate, b.endDate);
  if (span < 0) return { ok: false, error: "endDate liegt vor startDate." };
  if (span > 15) return { ok: false, error: "Der Zeitraum darf höchstens 16 Tage umfassen." };

  const minTemp = num(criteria.minTempMax, -60, 60);
  const maxWind = num(criteria.maxWindSpeed, 0, 500);
  const minSun = num(criteria.minSunshineHours, 0, 24);
  if (minTemp === null || maxWind === null || minSun === null) {
    return { ok: false, error: "criteria.minTempMax, maxWindSpeed und minSunshineHours sind erforderlich." };
  }
  let maxPrecip: number | null = null;
  if (criteria.maxPrecipitationSum !== null && criteria.maxPrecipitationSum !== undefined) {
    maxPrecip = num(criteria.maxPrecipitationSum, 0, ANY_PRECIP);
    if (maxPrecip === null) return { ok: false, error: "criteria.maxPrecipitationSum ist ungültig." };
  }

  const category = CATEGORIES.includes(b.category as Category) ? (b.category as Category) : "all";
  const limit = Math.round(num(b.limit, 1, LIMIT_MAX) ?? 100);
  const favoriteIds = Array.isArray(b.favoriteIds)
    ? b.favoriteIds.filter((v): v is number => Number.isInteger(v) && (v as number) > 0).slice(0, 100)
    : [];

  return {
    ok: true,
    value: {
      originLat,
      originLon,
      radiusKm,
      startDate: b.startDate,
      endDate: b.endDate,
      minTemp,
      maxPrecip,
      maxWind,
      minSun,
      category,
      limit,
      favoriteIds,
    },
  };
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

const SEARCH_FN = `search_weather_destinations(
  $1::float8, $2::float8, $3::float8, $4::date, $5::date, $6::real, $7::real, $8::real, $9::real, $10::int)`;
const TAG_FILTER = `($11::text[] IS NULL OR s.tags && $11::text[])`;

function fnParams(r: SearchRequest, limit: number): unknown[] {
  return [
    r.originLat,
    r.originLon,
    r.radiusKm * 1000,
    r.startDate,
    r.endDate,
    r.minTemp,
    r.maxPrecip ?? ANY_PRECIP,
    r.maxWind,
    r.minSun,
    limit,
    r.category === "all" ? null : CATEGORY_TAGS[r.category],
  ];
}

// Leichtgewichtige Zähl-Abfragen für die "Fast-Treffer". Sie bilden exakt die Logik von
// search_weather_destinations nach (Raster im Radius + 20 km, alle Tage müssen passen,
// Orte im exakten Radius), verzichten aber auf JSON-Aufbereitung und Sortierung.
const MATCHING_GRIDS = (tempCriterion: boolean) => `
  WITH o AS (SELECT ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::GEOGRAPHY AS geom),
  mg AS (
    SELECT f.grid_id, MIN(f.temp_max) AS min_t
    FROM weather_forecasts_daily f
    INNER JOIN weather_grid g ON g.grid_id = f.grid_id
    CROSS JOIN o
    WHERE ST_DWithin(g.geom, o.geom, $3::float8 + 20000)
      AND f.forecast_date BETWEEN $4::date AND $5::date
      ${tempCriterion ? "AND f.temp_max >= $6::real" : "AND $6::real IS NOT NULL"}
      AND f.precipitation_sum <= $7::real
      AND f.wind_speed_max <= $8::real
      AND COALESCE(f.sunshine_duration_hours, 0) >= $9::real
    GROUP BY f.grid_id
    HAVING COUNT(f.forecast_date) = ($5::date - $4::date) + 1
  )`;
const DESTINATIONS_IN_RADIUS = `
  FROM destinations d
  INNER JOIN mg ON mg.grid_id = d.grid_id
  CROSS JOIN o
  WHERE ST_DWithin(d.geom, o.geom, $3::float8)
    AND ($10::text[] IS NULL OR d.tags && $10::text[])`;

function countParams(r: SearchRequest): unknown[] {
  return [
    r.originLat,
    r.originLon,
    r.radiusKm * 1000,
    r.startDate,
    r.endDate,
    r.minTemp,
    r.maxPrecip ?? ANY_PRECIP,
    r.maxWind,
    r.minSun,
    r.category === "all" ? null : CATEGORY_TAGS[r.category],
  ];
}

async function countMatches(db: Queryable, r: SearchRequest): Promise<number> {
  const { rows } = await db.query(
    `${MATCHING_GRIDS(true)} SELECT COUNT(*)::int AS n ${DESTINATIONS_IN_RADIUS}`,
    countParams(r)
  );
  return Number(rows[0]?.n ?? 0);
}

function precipModeOf(maxPrecip: number | null): PrecipMode {
  if (maxPrecip === null) return "any";
  return maxPrecip <= 0 ? "dry" : "almost";
}

// ---------------------------------------------------------------------------
// Smart Empty State: "Fast-Treffer" mit Trefferzahl je Lockerung
// ---------------------------------------------------------------------------

async function findRelaxations(db: Queryable, r: SearchRequest): Promise<ApiRelaxation[]> {
  const out: ApiRelaxation[] = [];
  const orte = (n: number) => (n === 1 ? "1 Ort" : `${n} Orte`);
  const passt = (n: number) => (n === 1 ? "1 Ort passt dann" : `${n} Orte passen dann`);

  // 1) Radius um +100 km erweitern (ggf. weiter, bis Treffer auftauchen)
  for (const extra of [100, 200, 300]) {
    const radiusKm = Math.min(RADIUS_MAX, r.radiusKm + extra);
    if (radiusKm <= r.radiusKm) break;
    const n = await countMatches(db, { ...r, radiusKm });
    if (n > 0) {
      out.push({
        id: "radius",
        label: `Suchradius auf ${radiusKm} km erweitern`,
        hint: `${orte(n)} gefunden!`,
        count: n,
        patch: { radiusKm },
      });
      break;
    }
  }

  // 2) Temperatur senken: um 2 °C – oder so weit, bis es Treffer gibt.
  //    Eine Abfrage liefert, wie viele Orte bei welcher Mindesttemperatur noch passen würden.
  const temps = await db.query(
    `${MATCHING_GRIDS(false)}
     SELECT FLOOR(mg.min_t)::int AS t, COUNT(*)::int AS n ${DESTINATIONS_IN_RADIUS} GROUP BY 1`,
    countParams(r)
  );
  const histogram = temps.rows
    .map((row) => ({ t: Number(row.t), n: Number(row.n) }))
    .filter((row) => Number.isFinite(row.t));
  if (histogram.length > 0) {
    const minTemp = Math.min(r.minTemp - 2, Math.max(...histogram.map((row) => row.t)));
    const n = histogram.filter((row) => row.t >= minTemp).reduce((sum, row) => sum + row.n, 0);
    if (n > 0 && minTemp < r.minTemp) {
      out.push({
        id: "temp",
        label: `Temperatur auf ≥ ${minTemp} °C senken`,
        hint: `${orte(n)} im ${r.radiusKm}-km-Radius!`,
        count: n,
        patch: { minTemp },
      });
    }
  }

  const add = async (id: string, label: string, changed: SearchRequest, patch: ApiRelaxation["patch"]) => {
    const n = await countMatches(db, changed);
    if (n > 0) out.push({ id, label, hint: passt(n), count: n, patch });
  };

  // 3) Niederschlag lockern
  const mode = precipModeOf(r.maxPrecip);
  if (mode === "dry") {
    const before = out.length;
    await add("precip", "„Fast trocken“ (≤ 1 mm) erlauben", { ...r, maxPrecip: 1 }, { precipMode: "almost" });
    if (out.length === before) {
      await add("precip", "Regen ist mir egal", { ...r, maxPrecip: null }, { precipMode: "any" });
    }
  } else if (mode === "almost") {
    await add("precip", "Regen ist mir egal", { ...r, maxPrecip: null }, { precipMode: "any" });
  }

  // 4) Sonnenstunden lockern
  if (r.minSun >= 2) {
    const minSun = Math.max(0, r.minSun - 2);
    await add("sun", `Sonne auf ≥ ${minSun} Std. senken`, { ...r, minSun }, { minSun });
  }

  // 5) Wind lockern
  if (r.maxWind <= 50) {
    const maxWind = r.maxWind + 10;
    await add("wind", `Wind bis ${maxWind} km/h erlauben`, { ...r, maxWind }, { maxWind });
  }

  // 6) Orts-Charakter öffnen
  if (r.category !== "all") {
    await add("category", "Alle Orts-Typen anzeigen", { ...r, category: "all" }, { category: "all" });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Suche
// ---------------------------------------------------------------------------

function fulfilsCriteria(days: ApiDaily[], r: SearchRequest): boolean {
  const inRange = days.filter((d) => d.date >= r.startDate && d.date <= r.endDate);
  if (inRange.length !== dayDiff(r.startDate, r.endDate) + 1) return false;
  return inRange.every(
    (d) =>
      d.tempMax >= r.minTemp &&
      d.precip <= (r.maxPrecip ?? ANY_PRECIP) &&
      d.wind <= r.maxWind &&
      (d.sunshine ?? 0) >= r.minSun
  );
}

export async function runSearch(db: Queryable, r: SearchRequest): Promise<SearchResponse> {
  const started = Date.now();

  // 1) Treffer über die PostGIS-Funktion ("Alle Tage müssen passen").
  //    Die Funktion wird bewusst ohne inneres Limit aufgerufen und erst außen sortiert und
  //    begrenzt: Mit kleinem p_limit wählt der Planer einen Index-Scan über tourism_score,
  //    der in Messungen um ein Vielfaches langsamer war (ca. 3 s statt 0,2 s).
  const matches = await db.query(
    `SELECT s.destination_id, COUNT(*) OVER () AS total
     FROM ${SEARCH_FN} s
     WHERE ${TAG_FILTER}
     ORDER BY s.tourism_score DESC, s.avg_temp_max DESC, s.population DESC
     LIMIT $12::int`,
    [...fnParams(r, NO_LIMIT), r.limit]
  );
  const matchIds: number[] = matches.rows.map((row) => Number(row.destination_id));
  const totalMatches = Number(matches.rows[0]?.total ?? 0);

  // 2) Bekannte Ausflugsziele im Radius, die (noch) nicht unter den Treffern sind
  const candidates = await db.query(
    `SELECT d.destination_id
     FROM destinations d
     WHERE ST_DWithin(d.geom, ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::GEOGRAPHY, $3::float8)
       AND d.tourism_score >= $4::int
       AND d.destination_id <> ALL($5::int[])
     ORDER BY d.tourism_score DESC, d.population DESC
     LIMIT $6::int`,
    [r.originLat, r.originLon, r.radiusKm * 1000, OTHERS_MIN_SCORE, matchIds, OTHERS_LIMIT]
  );
  const candidateIds: number[] = candidates.rows.map((row) => Number(row.destination_id));

  // 3) Stammdaten aller beteiligten Orte (Treffer, Kandidaten, Merkliste)
  const allIds = [...new Set([...matchIds, ...candidateIds, ...r.favoriteIds])];
  const destRows = await db.query(
    `SELECT destination_id, name, country_code, admin_region, lat, lon, population, tourism_score, tags, grid_id
     FROM destinations WHERE destination_id = ANY($1::int[])`,
    [allIds]
  );
  const destinations: ApiDestination[] = destRows.rows.map((row) => ({
    id: Number(row.destination_id),
    name: String(row.name),
    countryCode: String(row.country_code),
    adminRegion: row.admin_region ?? null,
    lat: Number(row.lat),
    lon: Number(row.lon),
    population: Number(row.population ?? 0),
    tourismScore: Number(row.tourism_score ?? 0),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    gridId: Number(row.grid_id),
  }));

  // 4) Prognosen je Rasterpunkt (inkl. Vortag) für Timeline und Tages-Nachweis
  const gridIds = [...new Set(destinations.map((d) => d.gridId))];
  const forecastRows = await db.query(
    `SELECT grid_id, forecast_date::text AS date, temp_max, temp_min, precipitation_sum,
            precipitation_prob, wind_speed_max, sunshine_duration_hours, weather_code
     FROM weather_forecasts_daily
     WHERE grid_id = ANY($1::int[])
     ORDER BY grid_id, forecast_date`,
    [gridIds]
  );
  const forecasts: Record<string, ApiDaily[]> = {};
  for (const row of forecastRows.rows) {
    const key = String(row.grid_id);
    (forecasts[key] ??= []).push({
      date: String(row.date).slice(0, 10),
      tempMax: Number(row.temp_max),
      tempMin: Number(row.temp_min),
      precip: Number(row.precipitation_sum),
      precipProb: row.precipitation_prob === null || row.precipitation_prob === undefined ? null : Number(row.precipitation_prob),
      wind: Number(row.wind_speed_max),
      sunshine: row.sunshine_duration_hours === null || row.sunshine_duration_hours === undefined ? null : Number(row.sunshine_duration_hours),
      weatherCode: Number(row.weather_code),
    });
  }

  // 5) Gedimmte Karten-Punkte: nur Kandidaten, die die Kriterien wirklich verfehlen.
  //    (Passende Orte jenseits des Limits sind keine "Nicht-Treffer" und werden ausgelassen.)
  const byId = new Map(destinations.map((d) => [d.id, d]));
  const wantedTags = r.category === "all" ? null : CATEGORY_TAGS[r.category];
  const otherIds = candidateIds.filter((id) => {
    const dest = byId.get(id);
    if (!dest) return false;
    const weatherOk = fulfilsCriteria(forecasts[String(dest.gridId)] ?? [], r);
    const categoryOk = wantedTags === null || wantedTags.some((tag) => dest.tags.includes(tag));
    return !(weatherOk && categoryOk);
  });

  // 6) Fast-Treffer nur berechnen, wenn es keinen Treffer gibt
  const relaxations = totalMatches === 0 ? await findRelaxations(db, r) : [];

  const updated = await db.query("SELECT MAX(last_updated) AS t FROM weather_grid");
  const t = updated.rows[0]?.t;

  return {
    matchIds,
    totalMatches,
    otherIds,
    destinations,
    forecasts,
    relaxations,
    meta: {
      tookMs: Date.now() - started,
      weatherUpdatedAt: t ? new Date(t).toISOString() : null,
    },
  };
}
