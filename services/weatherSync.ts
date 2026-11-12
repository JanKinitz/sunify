// Phase 2 · Open-Meteo Batch-Synchronisation (Kapitel 6.2 der Spezifikation).
// Liest alle aktiven Rasterpunkte aus weather_grid, fragt die 14-Tage-Prognose in
// 100er-Batches bei der kostenlosen Open-Meteo Multi-Location API ab und schreibt sie
// per UPSERT in weather_forecasts_daily. Bei einer Nutzersuche wird diese API NIE aufgerufen.

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

const DAILY_VARIABLES = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "sunshine_duration",
] as const;

/** Schlüssel für die Datenbank-Sperre, damit nie zwei Synchronisationen parallel laufen. */
const ADVISORY_LOCK_KEY = 727001;

/** Minimale Datenbank-Schnittstelle (erfüllt von pg.Client) – hält den Dienst testbar. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface SyncOptions {
  /** Koordinaten pro Open-Meteo-Request (Standard: 100) */
  batchSize?: number;
  /** Prognosetage (Standard: 14) */
  forecastDays?: number;
  /** Pause zwischen zwei Batches in Millisekunden – schont das Open-Meteo-Minutenlimit */
  pauseMs?: number;
  /** Wartezeit vor einem erneuten Versuch nach HTTP 429 / 5xx (wird je Versuch vervielfacht) */
  retryDelayMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

export interface SyncResult {
  startedAt: string;
  durationMs: number;
  grids: number;
  batches: number;
  failedBatches: { batch: number; error: string }[];
  gridsUpdated: number;
  rowsUpserted: number;
  skippedDays: number;
  removedOldRows: number;
}

export class SyncBusyError extends Error {
  constructor() {
    super("Es läuft bereits eine Wetter-Synchronisation.");
    this.name = "SyncBusyError";
  }
}

interface GridRow {
  grid_id: number;
  lat: number;
  lon: number;
}

interface OpenMeteoLocation {
  elevation?: number;
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    sunshine_duration?: (number | null)[];
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

export function buildForecastUrl(points: { lat: number; lon: number }[], forecastDays = 14): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(","),
    longitude: points.map((p) => p.lon.toFixed(4)).join(","),
    daily: DAILY_VARIABLES.join(","),
    timezone: "Europe/Berlin",
    forecast_days: String(forecastDays),
  });
  return `${OPEN_METEO_URL}?${params.toString()}`;
}

async function fetchBatch(
  points: GridRow[],
  options: Required<Pick<SyncOptions, "forecastDays" | "retryDelayMs" | "maxRetries">> & {
    fetchImpl: typeof fetch;
    log: (message: string) => void;
  }
): Promise<OpenMeteoLocation[]> {
  const url = buildForecastUrl(points, options.forecastDays);
  let lastError = "unbekannter Fehler";
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (attempt > 0) {
      const wait = options.retryDelayMs * attempt;
      options.log(`   … erneuter Versuch ${attempt}/${options.maxRetries} in ${Math.round(wait / 1000)} s (${lastError})`);
      await sleep(wait);
    }
    let response: Response;
    try {
      response = await options.fetchImpl(url, { headers: { accept: "application/json" } });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      lastError = `HTTP ${response.status}`;
      continue;
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = (body as { reason?: string } | null)?.reason;
      throw new Error(`Open-Meteo HTTP ${response.status}${reason ? `: ${reason}` : ""}`);
    }
    // Bei genau einer Koordinate liefert Open-Meteo ein Objekt, sonst ein Array
    const list = (Array.isArray(body) ? body : [body]) as OpenMeteoLocation[];
    if (list.length !== points.length) {
      throw new Error(`Open-Meteo lieferte ${list.length} statt ${points.length} Standorte`);
    }
    return list;
  }
  throw new Error(`Open-Meteo nicht erreichbar (${lastError})`);
}

/** Wandelt die Open-Meteo-Antwort eines Batches in Spalten-Arrays für den UPSERT um. */
export function toForecastColumns(points: { grid_id: number }[], locations: OpenMeteoLocation[]) {
  const columns = {
    gridId: [] as number[],
    date: [] as string[],
    tempMax: [] as number[],
    tempMin: [] as number[],
    precip: [] as number[],
    precipProb: [] as (number | null)[],
    wind: [] as number[],
    sunshine: [] as (number | null)[],
    weatherCode: [] as number[],
  };
  let skippedDays = 0;

  locations.forEach((location, index) => {
    const daily = location.daily;
    const times = daily?.time ?? [];
    for (let i = 0; i < times.length; i++) {
      const tempMax = daily?.temperature_2m_max?.[i];
      const tempMin = daily?.temperature_2m_min?.[i];
      const precip = daily?.precipitation_sum?.[i];
      const wind = daily?.wind_speed_10m_max?.[i];
      const code = daily?.weather_code?.[i];
      // Pflichtwerte (NOT NULL im Schema) müssen vorhanden sein
      if (tempMax == null || tempMin == null || precip == null || wind == null || code == null) {
        skippedDays++;
        continue;
      }
      const prob = daily?.precipitation_probability_max?.[i];
      const sunSeconds = daily?.sunshine_duration?.[i];
      columns.gridId.push(points[index].grid_id);
      columns.date.push(times[i]);
      columns.tempMax.push(tempMax);
      columns.tempMin.push(tempMin);
      columns.precip.push(precip);
      columns.precipProb.push(prob == null ? null : Math.round(prob));
      columns.wind.push(wind);
      // Open-Meteo liefert die Sonnenscheindauer in Sekunden → Stunden
      columns.sunshine.push(sunSeconds == null ? null : round(sunSeconds / 3600, 2));
      columns.weatherCode.push(Math.round(code));
    }
  });

  return { columns, skippedDays };
}

const UPSERT_SQL = `
  INSERT INTO weather_forecasts_daily
    (grid_id, forecast_date, temp_max, temp_min, precipitation_sum, precipitation_prob,
     wind_speed_max, sunshine_duration_hours, weather_code)
  SELECT * FROM unnest(
    $1::int[], $2::date[], $3::real[], $4::real[], $5::real[], $6::int[], $7::real[], $8::real[], $9::int[]
  )
  ON CONFLICT (grid_id, forecast_date) DO UPDATE SET
    temp_max = EXCLUDED.temp_max,
    temp_min = EXCLUDED.temp_min,
    precipitation_sum = EXCLUDED.precipitation_sum,
    precipitation_prob = EXCLUDED.precipitation_prob,
    wind_speed_max = EXCLUDED.wind_speed_max,
    sunshine_duration_hours = EXCLUDED.sunshine_duration_hours,
    weather_code = EXCLUDED.weather_code`;

const GRID_UPDATE_SQL = `
  UPDATE weather_grid g
  SET last_updated = now(), elevation = COALESCE(t.elevation, g.elevation)
  FROM unnest($1::int[], $2::int[]) AS t(grid_id, elevation)
  WHERE g.grid_id = t.grid_id`;

export async function syncWeather(db: Queryable, options: SyncOptions = {}): Promise<SyncResult> {
  const batchSize = options.batchSize ?? 100;
  const forecastDays = options.forecastDays ?? 14;
  // Open-Meteo erlaubt im kostenlosen Tarif rund 600 Standorte pro Minute:
  // 100 Standorte alle 11 s bleiben sicher darunter (ca. 80 s für ~800 Rasterpunkte).
  const pauseMs = options.pauseMs ?? 11000;
  const retryDelayMs = options.retryDelayMs ?? 20000;
  const maxRetries = options.maxRetries ?? 3;
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => undefined);

  const started = Date.now();
  const lock = await db.query("SELECT pg_try_advisory_lock($1) AS locked", [ADVISORY_LOCK_KEY]);
  if (lock.rows[0]?.locked !== true && lock.rows[0]?.locked !== "t") throw new SyncBusyError();

  try {
    const { rows } = await db.query("SELECT grid_id, lat, lon FROM weather_grid ORDER BY grid_id");
    const grids: GridRow[] = rows.map((r) => ({
      grid_id: Number(r.grid_id),
      lat: Number(r.lat),
      lon: Number(r.lon),
    }));

    const result: SyncResult = {
      startedAt: new Date(started).toISOString(),
      durationMs: 0,
      grids: grids.length,
      batches: Math.ceil(grids.length / batchSize),
      failedBatches: [],
      gridsUpdated: 0,
      rowsUpserted: 0,
      skippedDays: 0,
      removedOldRows: 0,
    };

    for (let b = 0; b < result.batches; b++) {
      const chunk = grids.slice(b * batchSize, (b + 1) * batchSize);
      if (b > 0 && pauseMs > 0) await sleep(pauseMs);
      try {
        const locations = await fetchBatch(chunk, { forecastDays, retryDelayMs, maxRetries, fetchImpl, log });
        const { columns, skippedDays } = toForecastColumns(chunk, locations);
        result.skippedDays += skippedDays;
        if (columns.gridId.length > 0) {
          await db.query(UPSERT_SQL, [
            columns.gridId,
            columns.date,
            columns.tempMax,
            columns.tempMin,
            columns.precip,
            columns.precipProb,
            columns.wind,
            columns.sunshine,
            columns.weatherCode,
          ]);
          result.rowsUpserted += columns.gridId.length;
        }
        await db.query(GRID_UPDATE_SQL, [
          chunk.map((g) => g.grid_id),
          locations.map((l) => (typeof l.elevation === "number" ? Math.round(l.elevation) : null)),
        ]);
        result.gridsUpdated += chunk.length;
        log(`   Batch ${b + 1}/${result.batches}: ${chunk.length} Rasterpunkte, ${columns.gridId.length} Tageswerte`);
      } catch (error) {
        // Ein fehlgeschlagener Batch bricht den Lauf nicht ab – die übrigen werden trotzdem aktualisiert
        const message = error instanceof Error ? error.message : String(error);
        result.failedBatches.push({ batch: b + 1, error: message });
        log(`   Batch ${b + 1}/${result.batches}: FEHLER – ${message}`);
      }
    }

    // Abgelaufene Prognosen entfernen (der Vortag bleibt für die Detailansicht erhalten)
    const removed = await db.query("DELETE FROM weather_forecasts_daily WHERE forecast_date < CURRENT_DATE - 1");
    result.removedOldRows = removed.rowCount ?? 0;
    result.durationMs = Date.now() - started;
    return result;
  } finally {
    await db.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => undefined);
  }
}
