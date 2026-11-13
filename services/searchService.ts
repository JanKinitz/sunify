// Sunify 2.0 · Rückwärtssuche auf der eigenen Datenbank.
// Validiert die Filter, ruft search_destinations_v2 auf (Toleranzstufen, Höhenkorrektur) und liefert
// zusätzlich, was die Oberfläche braucht: Stammdaten, Tageswerte je Rasterpunkt, gedimmte Nicht-Treffer
// für die Karte und "Fast-Treffer"-Vorschläge. Es findet KEIN externer Wetter-API-Call statt.

import { CATEGORIES, CATEGORY_TAGS } from "@/lib/categories";
import type { Relaxation } from "@/lib/search";
import type { Category, PrecipMode, Tolerance } from "@/lib/types";

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

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
  tolerance: Tolerance;
  category: Category;
  limit: number;
  favoriteIds: number[];
}

const RADIUS_MIN = 10;
const RADIUS_MAX = 500;
const LIMIT_MAX = 100;
const OTHERS_LIMIT = 40;
const OTHERS_MIN_SCORE = 50;

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

export function parseSearchRequest(body: unknown): { ok: true; value: SearchRequest } | { ok: false; error: string } {
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
    maxPrecip = num(criteria.maxPrecipitationSum, 0, 100000);
    if (maxPrecip === null) return { ok: false, error: "criteria.maxPrecipitationSum ist ungültig." };
  }

  const tolerance = (b.tolerance === 1 || b.tolerance === 2 ? b.tolerance : 0) as Tolerance;
  const category = CATEGORIES.includes(b.category as Category) ? (b.category as Category) : "all";
  const limit = Math.round(num(b.limit, 1, LIMIT_MAX) ?? 100);
  const favoriteIds = Array.isArray(b.favoriteIds)
    ? b.favoriteIds.filter((v): v is number => Number.isInteger(v) && (v as number) > 0).slice(0, 100)
    : [];

  return {
    ok: true,
    value: {
      originLat, originLon, radiusKm, startDate: b.startDate, endDate: b.endDate,
      minTemp, maxPrecip, maxWind, minSun, tolerance, category, limit, favoriteIds,
    },
  };
}

// ---------------------------------------------------------------------------
// Datenbank
// ---------------------------------------------------------------------------

const SEARCH_SQL = `SELECT * FROM search_destinations_v2(
  $1::float8, $2::float8, $3::float8, $4::date, $5::date, $6::real, $7::real, $8::real, $9::real, $10::smallint, $11::text[], $12::int)`;

function searchParams(r: SearchRequest, limit: number): unknown[] {
  return [
    r.originLat, r.originLon, r.radiusKm * 1000, r.startDate, r.endDate,
    r.minTemp, r.maxPrecip, r.maxWind, r.minSun, r.tolerance,
    r.category === "all" ? null : CATEGORY_TAGS[r.category], limit,
  ];
}

async function countMatches(db: Queryable, r: SearchRequest): Promise<number> {
  const { rows } = await db.query(SEARCH_SQL, searchParams(r, 1));
  return Number(rows[0]?.total_count ?? 0);
}

function precipModeOf(maxPrecip: number | null): PrecipMode {
  if (maxPrecip === null) return "any";
  return maxPrecip <= 0 ? "dry" : "almost";
}

async function findRelaxations(db: Queryable, r: SearchRequest): Promise<Relaxation[]> {
  const out: Relaxation[] = [];
  const tryAdd = async (id: Relaxation["id"], changed: SearchRequest, patch: Relaxation["patch"]) => {
    const n = await countMatches(db, changed);
    if (n > 0) out.push({ id, count: n, patch });
    return n;
  };

  // 1) Radius erweitern (+100 km, sonst weiter)
  for (const extra of [100, 200, 300]) {
    const radiusKm = Math.min(RADIUS_MAX, r.radiusKm + extra);
    if (radiusKm <= r.radiusKm) break;
    if ((await tryAdd("radius", { ...r, radiusKm }, { radiusKm })) > 0) break;
  }
  // 2) Toleranz erhöhen
  if (r.tolerance < 2) {
    const tolerance = (r.tolerance + 1) as Tolerance;
    await tryAdd("tolerance", { ...r, tolerance }, { tolerance });
  }
  // 3) Temperatur in 2-°C-Schritten senken, bis Treffer auftauchen (höchstens bis -5 °C)
  for (let minTemp = r.minTemp - 2; minTemp >= Math.min(-5, r.minTemp - 2); minTemp -= 2) {
    if ((await tryAdd("temp", { ...r, minTemp }, { minTemp })) > 0) break;
  }
  // 4) Niederschlag lockern
  const mode = precipModeOf(r.maxPrecip);
  if (mode === "dry") await tryAdd("precip", { ...r, maxPrecip: 1 }, { precipMode: "almost" });
  else if (mode === "almost") await tryAdd("precip", { ...r, maxPrecip: null }, { precipMode: "any" });
  // 5) Sonne und Wind lockern, Orts-Charakter öffnen
  if (r.minSun >= 2) {
    const minSun = Math.max(0, r.minSun - 2);
    await tryAdd("sun", { ...r, minSun }, { minSun });
  }
  if (r.maxWind <= 50) await tryAdd("wind", { ...r, maxWind: r.maxWind + 10 }, { maxWind: r.maxWind + 10 });
  if (r.category !== "all") await tryAdd("category", { ...r, category: "all" }, { category: "all" });
  return out;
}

function toDaily(row: any) {
  const start = new Date(`${String(row.start_date).slice(0, 10)}T12:00:00Z`);
  const tmax: number[] = row.temp_max ?? [];
  return tmax.map((_, i) => ({
    date: new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10),
    tempMax: Number(row.temp_max[i]),
    tempMin: Number(row.temp_min[i]),
    precip: Number(row.precip[i]),
    precipProb: row.precip_prob?.[i] == null ? null : Number(row.precip_prob[i]),
    wind: Number(row.wind_max[i]),
    sunshine: row.sunshine?.[i] == null ? null : Number(row.sunshine[i]),
    weatherCode: Number(row.weather_code[i]),
  }));
}

export async function runSearch(db: Queryable, r: SearchRequest) {
  const started = Date.now();
  // Laufzeiten der einzelnen Abfragen (ms) – stehen in meta.timings, für Tests und Fehlersuche
  const timings: Record<string, number> = {};
  let last = started;
  const lap = (step: string) => {
    const now = Date.now();
    timings[step] = now - last;
    last = now;
  };

  // 1) Treffer (die Datenbank sortiert: volle Treffer, Übereinstimmung, Tourismus-Score)
  const matches = await db.query(SEARCH_SQL, searchParams(r, r.limit));
  const matchRows = matches.rows.map((row) => ({
    id: Number(row.destination_id),
    pct: Number(row.match_pct),
    strict: row.strict_match === true || row.strict_match === "t",
  }));
  const matchIds = matchRows.map((m) => m.id);
  const totalMatches = Number(matches.rows[0]?.total_count ?? 0);
  lap("search");

  // 2) Bekannte Orte im Radius, die keine Treffer sind (gedimmte Punkte auf der Karte)
  const others = await db.query(
    `SELECT d.destination_id
     FROM destinations d
     WHERE ST_DWithin(d.geom, ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::GEOGRAPHY, $3::float8)
       AND d.tourism_score >= $4::int
       AND d.destination_id <> ALL($5::int[])
     ORDER BY d.tourism_score DESC, d.population DESC
     LIMIT $6::int`,
    [r.originLat, r.originLon, r.radiusKm * 1000, OTHERS_MIN_SCORE, matchIds, OTHERS_LIMIT]
  );
  const otherIds: number[] = others.rows.map((row) => Number(row.destination_id));
  lap("others");

  // 3) Stammdaten (Treffer, Nicht-Treffer, Merkliste) inkl. Höhenkorrektur je Ort
  const allIds = [...new Set([...matchIds, ...otherIds, ...r.favoriteIds])];
  const destRows = await db.query(
    `SELECT d.destination_id, d.name, d.name_de, d.name_en, d.country_code, d.admin_region, d.admin_region_de,
            d.admin_region_en, d.lat, d.lon, d.elevation, d.population, d.tourism_score, d.tags, d.grid_id,
            d.image_file, d.image_author, d.image_license,
            LEAST(8, GREATEST(-8, (COALESCE(g.elevation, d.elevation, 0) - COALESCE(d.elevation, g.elevation, 0)) * 0.0065)) AS corr
     FROM destinations d JOIN weather_grid g ON g.grid_id = d.grid_id
     WHERE d.destination_id = ANY($1::int[])`,
    [allIds]
  );
  const destinations = destRows.rows.map((row) => ({
    id: Number(row.destination_id),
    name: String(row.name),
    nameDe: row.name_de ?? null,
    nameEn: row.name_en ?? null,
    countryCode: String(row.country_code),
    adminRegion: row.admin_region ?? null,
    adminRegionDe: row.admin_region_de ?? null,
    adminRegionEn: row.admin_region_en ?? null,
    lat: Number(row.lat),
    lon: Number(row.lon),
    elevation: row.elevation == null ? null : Number(row.elevation),
    population: Number(row.population ?? 0),
    tourismScore: Number(row.tourism_score ?? 0),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    gridId: Number(row.grid_id),
    tempCorrection: Math.round(Number(row.corr ?? 0) * 10) / 10,
    image: row.image_file
      ? { file: String(row.image_file), author: String(row.image_author ?? ""), license: String(row.image_license ?? "") }
      : null,
  }));

  lap("destinations");

  // 4) Tageswerte je Rasterpunkt (Timeline, Tages-Nachweis)
  const gridIds = [...new Set(destinations.map((d) => d.gridId))];
  const fc = await db.query(
    `SELECT grid_id, start_date::text AS start_date, temp_max, temp_min, precip, precip_prob, wind_max, sunshine, weather_code
     FROM weather_forecasts WHERE grid_id = ANY($1::int[])`,
    [gridIds]
  );
  const forecasts: Record<string, ReturnType<typeof toDaily>> = {};
  for (const row of fc.rows) forecasts[String(row.grid_id)] = toDaily(row);
  lap("forecasts");

  // 5) Fast-Treffer nur bei leerem Ergebnis
  const relaxations = totalMatches === 0 ? await findRelaxations(db, r) : [];
  lap("relaxations");

  const updated = await db.query("SELECT MAX(updated_at) AS t FROM weather_forecasts");
  const t = updated.rows[0]?.t;
  lap("updated");

  return {
    matches: matchRows,
    totalMatches,
    otherIds,
    destinations,
    forecasts,
    relaxations,
    meta: { tookMs: Date.now() - started, timings, weatherUpdatedAt: t ? new Date(t).toISOString() : null },
  };
}
