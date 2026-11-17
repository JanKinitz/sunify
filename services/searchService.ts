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
const OTHERS_MIN_SCORE = 35;

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
  $1::float8, $2::float8, $3::float8, $4::date, $5::date, $6::real, $7::real, $8::real, $9::real, $10::smallint,
  $11::text[], $12::int, $13::int, $14::smallint)`;

/** others: Anzahl Nicht-Treffer (graue Punkte), die im selben Durchgang mitkommen */
function searchParams(r: SearchRequest, limit: number, others = 0): unknown[] {
  return [
    r.originLat, r.originLon, r.radiusKm * 1000, r.startDate, r.endDate,
    r.minTemp, r.maxPrecip, r.maxWind, r.minSun, r.tolerance,
    r.category === "all" ? null : CATEGORY_TAGS[r.category], limit, others, OTHERS_MIN_SCORE,
  ];
}

// Stammdaten, Tageswerte und Datenstand in EINER Abfrage (spart Wege zwischen Server und Datenbank)
const DETAILS_SQL = `
WITH ids AS (SELECT unnest($1::int[]) AS id),
d AS (
  SELECT d.destination_id, d.name, d.name_de, d.name_en, d.country_code, d.admin_region, d.admin_region_de,
         d.admin_region_en, d.lat, d.lon, d.elevation, d.population, d.tourism_score, d.tags, d.grid_id,
         -- Foto aus dem Neuaufbau, sonst nachgetragenes (pipeline/images.py)
         COALESCE(d.image_file, pi.image_file) AS image_file,
         CASE WHEN d.image_file IS NOT NULL THEN d.image_author ELSE pi.image_author END AS image_author,
         CASE WHEN d.image_file IS NOT NULL THEN d.image_license ELSE pi.image_license END AS image_license,
         LEAST(8, GREATEST(-8, (COALESCE(g.elevation, d.elevation, 0) - COALESCE(d.elevation, g.elevation, 0)) * 0.0065)) AS corr
  FROM destinations d JOIN weather_grid g ON g.grid_id = d.grid_id
  LEFT JOIN place_images pi ON pi.geoname_id = d.geoname_id AND d.image_file IS NULL
  WHERE d.destination_id IN (SELECT id FROM ids)
)
SELECT
  (SELECT COALESCE(json_agg(d), '[]'::json) FROM d) AS destinations,
  (SELECT COALESCE(json_agg(f), '[]'::json) FROM (
     SELECT grid_id, start_date::text AS start_date, temp_max, temp_min, precip, precip_prob, wind_max, sunshine, weather_code
     FROM weather_forecasts WHERE grid_id IN (SELECT DISTINCT grid_id FROM d)) f) AS forecasts,
  (SELECT MAX(updated_at) FROM weather_forecasts) AS updated`;

async function countMatches(db: Queryable, r: SearchRequest): Promise<number> {
  const { rows } = await db.query(SEARCH_SQL, searchParams(r, 1));
  return Number(rows[0]?.total_count ?? 0);
}

interface PoolLike {
  connect(): Promise<Queryable & { release(): void }>;
}

/**
 * Zählung mit hartem Zeitlimit in der Datenbank: Nach Ablauf bricht PostgreSQL die Abfrage selbst ab.
 * Sonst liefen nicht mehr benötigte Lockerungs-Zählungen weiter, hielten Verbindungen fest und bremsten
 * die nächsten Suchen (im Test bis über 60 s „Suche läuft …“).
 */
async function countMatchesWithin(db: Queryable, r: SearchRequest, deadline: number): Promise<number> {
  const pool = db as Partial<PoolLike>;
  if (typeof pool.connect !== "function") return countMatches(db, r);
  const client = await pool.connect();
  try {
    // Restzeit erst messen, wenn die Verbindung da ist (Wartezeit im Pool zählt mit)
    const ms = Math.round(deadline - Date.now());
    if (ms < 200) throw new Error("kein Zeitbudget mehr");
    // SET LOCAL in einer Transaktion: gilt auch hinter einem Transaktions-Pooler nur für diese Abfrage
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${ms}`);
    const n = await countMatches(client, r);
    await client.query("COMMIT");
    return n;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function precipModeOf(maxPrecip: number | null): PrecipMode {
  if (maxPrecip === null) return "any";
  return maxPrecip <= 0 ? "dry" : "almost";
}

/** Zeitbudget für Lockerungsvorschläge – die Netlify-Funktion darf insgesamt nicht ablaufen */
const RELAX_BUDGET_MS = 8_000;

/**
 * Lockerungsvorschläge für eine Suche ohne Treffer (Smart Empty State).
 * Alle Kandidaten laufen parallel (der Pool begrenzt die gleichzeitigen Verbindungen); was nach
 * RELAX_BUDGET_MS nicht fertig ist, fällt weg. Früher liefen bis zu 16 Abfragen nacheinander –
 * bei großem Radius über 25 s, dann brach die Funktion ab und die Seite blieb leer.
 */
async function findRelaxations(db: Queryable, r: SearchRequest): Promise<Relaxation[]> {
  type Candidate = { id: Relaxation["id"]; changed: SearchRequest; patch: Relaxation["patch"]; rank: number };
  const candidates: Candidate[] = [];

  // Toleranz zuerst einreihen (der Pool arbeitet der Reihe nach ab): „Etwas flexibel“ bzw. „Flexibel“
  // soll als Vorschlag möglichst immer dabei sein, wenn es damit Orte gibt – auch knapp vor dem Zeitbudget.
  for (let tolerance = r.tolerance + 1; tolerance <= 2; tolerance++) {
    const t = tolerance as Tolerance;
    candidates.push({ id: "tolerance", changed: { ...r, tolerance: t }, patch: { tolerance: t }, rank: t });
  }

  // 1) Radius erweitern: kleinste Erweiterung mit Treffern gewinnt
  for (const extra of [100, 200, 300]) {
    const radiusKm = Math.min(RADIUS_MAX, r.radiusKm + extra);
    if (radiusKm <= r.radiusKm || candidates.some((c) => c.id === "radius" && c.changed.radiusKm === radiusKm)) continue;
    candidates.push({ id: "radius", changed: { ...r, radiusKm }, patch: { radiusKm }, rank: extra });
  }
  // 3) Temperatur senken: kleinste Senkung mit Treffern gewinnt (höchstens bis -5 °C)
  if (r.minTemp > -5) {
    const steps = [2, 4, 6, 10].map((d) => Math.max(-5, r.minTemp - d));
    for (const minTemp of [...new Set(steps)]) {
      candidates.push({ id: "temp", changed: { ...r, minTemp }, patch: { minTemp }, rank: r.minTemp - minTemp });
    }
  }
  // 4) Niederschlag lockern
  const mode = precipModeOf(r.maxPrecip);
  if (mode === "dry") candidates.push({ id: "precip", changed: { ...r, maxPrecip: 1 }, patch: { precipMode: "almost" }, rank: 0 });
  else if (mode === "almost") candidates.push({ id: "precip", changed: { ...r, maxPrecip: null }, patch: { precipMode: "any" }, rank: 0 });
  // 5) Sonne und Wind lockern, Orts-Charakter öffnen
  if (r.minSun >= 2) {
    const minSun = Math.max(0, r.minSun - 2);
    candidates.push({ id: "sun", changed: { ...r, minSun }, patch: { minSun }, rank: 0 });
  }
  if (r.maxWind <= 50) candidates.push({ id: "wind", changed: { ...r, maxWind: r.maxWind + 10 }, patch: { maxWind: r.maxWind + 10 }, rank: 0 });
  if (r.category !== "all") candidates.push({ id: "category", changed: { ...r, category: "all" }, patch: { category: "all" }, rank: 0 });

  const counts = new Map<Candidate, number>();
  const deadline = Date.now() + RELAX_BUDGET_MS;
  const work = Promise.all(
    candidates.map((c) =>
      countMatchesWithin(db, c.changed, deadline)
        .then((n) => void counts.set(c, n))
        .catch(() => undefined)
    )
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise<void>((done) => (timer = setTimeout(done, RELAX_BUDGET_MS)))]);
  clearTimeout(timer);

  // je Art der beste Kandidat (kleinste Änderung), Reihenfolge wie bisher
  const order: Relaxation["id"][] = ["radius", "tolerance", "temp", "precip", "sun", "wind", "category"];
  const out: Relaxation[] = [];
  for (const id of order) {
    const best = candidates
      .filter((c) => c.id === id && (counts.get(c) ?? 0) > 0)
      .sort((a, b) => a.rank - b.rank)[0];
    if (best) out.push({ id, count: counts.get(best)!, patch: best.patch });
  }
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

  // 1) Treffer (sortiert: volle Treffer, Übereinstimmung, Tourismus-Score) und – im selben Durchgang –
  //    gleichmäßig verteilte bekannte Orte, deren Wetter NICHT passt (graue Punkte auf der Karte)
  const result = await db.query(SEARCH_SQL, searchParams(r, r.limit, OTHERS_LIMIT));
  const isMatch = (row: any) => row.is_match === true || row.is_match === "t";
  const matchRows = result.rows.filter(isMatch).map((row) => ({
    id: Number(row.destination_id),
    pct: Number(row.match_pct),
    strict: row.strict_match === true || row.strict_match === "t",
  }));
  const matchIds = matchRows.map((m) => m.id);
  const otherIds: number[] = result.rows.filter((row) => !isMatch(row)).map((row) => Number(row.destination_id));
  const totalMatches = Number(result.rows[0]?.total_count ?? 0);
  lap("search");

  // 2) Stammdaten (Treffer, Nicht-Treffer, Merkliste), Tageswerte je Rasterpunkt und Datenstand
  const allIds = [...new Set([...matchIds, ...otherIds, ...r.favoriteIds])];
  const details = await db.query(DETAILS_SQL, [allIds]);
  const detailRow = details.rows[0] ?? {};
  const destRows: any[] = Array.isArray(detailRow.destinations) ? detailRow.destinations : [];
  const destinations = destRows.map((row) => ({
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
  const forecasts: Record<string, ReturnType<typeof toDaily>> = {};
  const fcRows: any[] = Array.isArray(detailRow.forecasts) ? detailRow.forecasts : [];
  for (const row of fcRows) forecasts[String(row.grid_id)] = toDaily(row);
  const t = detailRow.updated;
  lap("details");

  // 3) Fast-Treffer-Vorschläge nur bei leerem Ergebnis
  const relaxations = totalMatches === 0 ? await findRelaxations(db, r) : [];
  lap("relaxations");

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
