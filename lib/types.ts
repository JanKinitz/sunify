// Zentrale Typen für den Sunify-Prototyp (Phase 0).
// Die Feldnamen orientieren sich am späteren API-Vertrag (Kapitel 5 & 7 der Spezifikation),
// damit die Mock-Daten in Phase 3 ohne UI-Umbau durch POST /api/search ersetzt werden können.

export type TagKey =
  | "mountains"
  | "hiking"
  | "lake"
  | "coast"
  | "historic"
  | "wine"
  | "culture"
  | "wellness";

export type Category = "all" | "mountains" | "water" | "historic" | "wine";

export type PrecipMode = "dry" | "almost" | "any";

export type DatePreset = "weekend" | "nextWeekend" | "tomorrow" | "custom";

export type SortKey = "score" | "temp" | "sun" | "distance" | "population";

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  tempMax: number; // °C
  tempMin: number; // °C
  precip: number; // mm
  precipProb: number | null; // % (null = keine Angabe)
  wind: number; // km/h (max. Windgeschwindigkeit)
  gusts?: number; // km/h (Böen) – nur in den Mock-Daten vorhanden
  sunshine: number; // Stunden
  weatherCode: number; // WMO-Code
}

export interface Destination {
  id: number;
  name: string;
  countryCode: "DE" | "AT" | "CH";
  adminRegion: string; // Bundesland / Kanton
  area: string; // touristische Region, z. B. "Schwarzwald"
  lat: number;
  lon: number;
  population: number;
  tourismScore: number; // 0–100
  tags: TagKey[];
  hashtags: string[];
  teaser: string;
  emoji: string;
  forecasts: DailyForecast[]; // 14 Tage ab heute (ggf. inkl. Vortag)
  /** Wetter-Rasterpunkt des Orts (Orte mit gleicher gridId haben identische Prognosen) */
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
}

export interface DayCheck {
  day: DailyForecast;
  tempOk: boolean;
  precipOk: boolean;
  windOk: boolean;
  sunOk: boolean;
  allOk: boolean;
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
}
