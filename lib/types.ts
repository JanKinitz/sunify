// Zentrale Typen der App. Die Feldnamen entsprechen dem API-Vertrag von POST /api/search.

export type TagKey =
  | "mountains"
  | "hiking"
  | "lake"
  | "coast"
  | "historic"
  | "wine"
  | "culture"
  | "wellness";

export type Category = "all" | "mountains" | "water" | "historic" | "wine" | "wellness";

export type PrecipMode = "dry" | "almost" | "any";

export type DatePreset = "weekend" | "nextWeekend" | "tomorrow" | "custom";

export type SortKey = "score" | "temp" | "sun" | "distance" | "population";

/** 0 = strikt, 1 = etwas flexibel, 2 = flexibel */
export type Tolerance = 0 | 1 | 2;

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  tempMax: number; // °C (bereits auf die Höhe des Orts korrigiert)
  tempMin: number; // °C
  precip: number; // mm
  precipProb: number | null; // % (null = keine Angabe)
  wind: number; // km/h (max. Windgeschwindigkeit)
  sunshine: number; // Stunden
  weatherCode: number; // WMO-Code
}

export interface DestinationImage {
  file: string; // Dateiname auf Wikimedia Commons
  author: string;
  license: string;
}

export interface Destination {
  id: number;
  name: string; // in der gewählten Sprache
  countryCode: string;
  adminRegion: string; // Bundesland / Region in der gewählten Sprache
  area: string; // touristische Region (falls bekannt), sonst gleich adminRegion
  lat: number;
  lon: number;
  elevation: number | null;
  population: number;
  tourismScore: number; // 0–100
  tags: TagKey[];
  hashtags: string[];
  teaser: string;
  emoji: string;
  image: DestinationImage | null;
  /** Höhenkorrektur der Temperatur gegenüber dem Rasterpunkt (°C) */
  tempCorrection: number;
  forecasts: DailyForecast[];
  /** Wetter-Rasterpunkt des Orts (Orte mit gleicher gridId haben dasselbe Wetter, bis auf die Höhenkorrektur) */
  gridId?: number;
}

export interface Origin {
  id: string;
  name: string;
  /** Zusatz für die Vorschlagsliste, z. B. "Rheinland-Pfalz, Deutschland" */
  detail?: string;
  lat: number;
  lon: number;
}

export interface Filters {
  origin: Origin;
  radiusKm: number;
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
  minTemp: number;
  precipMode: PrecipMode;
  maxWind: number;
  minSun: number;
  category: Category;
  tolerance: Tolerance;
}

/** Bewertung eines Kriteriums an einem Tag: erfüllt, knapp daneben (im Toleranzbereich), verfehlt */
export type CheckState = "ok" | "near" | "fail";

export interface DayCheck {
  day: DailyForecast;
  temp: CheckState;
  precip: CheckState;
  wind: CheckState;
  sun: CheckState;
  /** alle Kriterien exakt erfüllt */
  allOk: boolean;
  /** alle Kriterien mindestens im Toleranzbereich */
  allNear: boolean;
}

export interface SearchResult {
  destination: Destination;
  distanceKm: number;
  driveMinutes: number;
  days: DailyForecast[];
  avgTempMax: number;
  totalPrecip: number;
  maxWind: number;
  avgSunshine: number;
  /** Anteil exakt erfüllter Kriterien über alle Tage (0–100); nur bei Treffern gesetzt */
  matchPct?: number;
  /** true = alle Tage erfüllen alle Kriterien exakt */
  strict?: boolean;
}
