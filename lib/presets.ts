// „Meine Suchen“: eigene Vorlagen mit Startort, Umkreis und Wunschwetter (ohne Zeitraum).
// Gespeichert nur im Browser (LocalStorage) – kein Konto, keine Daten auf dem Server.
// Eine Vorlage kann als Start-Vorlage markiert werden: Sie wird beim Öffnen der App geladen,
// sofern der Link keine eigenen Such-Parameter mitbringt (geteilte Links haben Vorrang).

import { CATEGORIES, SUN_MAX, TEMP_MAX, TEMP_MIN, WIND_MAX, WIND_MIN } from "./categories";
import { hasOrigin } from "./origins";
import { RADIUS_MAX, RADIUS_MIN } from "./search";
import type { Category, Filters, Origin, PrecipMode, Tolerance } from "./types";

export const PRESETS_KEY = "sunify:presets";
export const MAX_PRESETS = 12;
export const PRESET_NAME_MAX = 40;

/** Alles aus den Filtern außer dem Zeitraum */
export type PresetFilters = Omit<Filters, "datePreset" | "startDate" | "endDate">;

export interface SavedSearch {
  id: string;
  name: string;
  /** Beim Öffnen der App automatisch laden */
  isDefault: boolean;
  filters: PresetFilters;
}

/** Such-Parameter in der Adresse (andere wie lang oder source zählen nicht) */
const FILTER_PARAMS = ["o", "lat", "lon", "n", "r", "d", "s", "e", "t", "p", "w", "sun", "c", "tol"];

export function hasFilterParams(search: string): boolean {
  const q = new URLSearchParams(search);
  return FILTER_PARAMS.some((k) => q.has(k));
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
const PRECIP: PrecipMode[] = ["dry", "almost", "any"];

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Gespeicherte Daten prüfen – alles Unbrauchbare fällt weg, Werte werden auf gültige Bereiche begrenzt. */
function sanitize(raw: unknown): SavedSearch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const f = r.filters as Record<string, unknown> | undefined;
  const o = f?.origin as Record<string, unknown> | undefined;
  if (typeof r.id !== "string" || typeof r.name !== "string" || !r.name.trim() || !f || !o) return null;
  if (typeof o.id !== "string" || typeof o.name !== "string" || !isNum(o.lat) || !isNum(o.lon)) return null;
  const origin: Origin = { id: o.id, name: o.name.slice(0, 80), lat: o.lat, lon: o.lon };
  if (!hasOrigin(origin)) return null;
  return {
    id: r.id,
    name: r.name.trim().slice(0, PRESET_NAME_MAX),
    isDefault: r.isDefault === true,
    filters: {
      origin,
      radiusKm: isNum(f.radiusKm) ? clamp(f.radiusKm, RADIUS_MIN, RADIUS_MAX) : 200,
      minTemp: isNum(f.minTemp) ? clamp(f.minTemp, TEMP_MIN, TEMP_MAX) : TEMP_MIN,
      precipMode: PRECIP.includes(f.precipMode as PrecipMode) ? (f.precipMode as PrecipMode) : "any",
      maxWind: isNum(f.maxWind) ? clamp(f.maxWind, WIND_MIN, WIND_MAX) : WIND_MAX,
      minSun: isNum(f.minSun) ? clamp(f.minSun, 0, SUN_MAX) : 0,
      category: CATEGORIES.includes(f.category as Category) ? (f.category as Category) : "all",
      tolerance: (isNum(f.tolerance) ? clamp(f.tolerance, 0, 2) : 0) as Tolerance,
    },
  };
}

export function loadPresets(): SavedSearch[] {
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const list = parsed.map(sanitize).filter((p): p is SavedSearch => p !== null).slice(0, MAX_PRESETS);
    // höchstens eine Start-Vorlage
    let seen = false;
    return list.map((p) => {
      if (!p.isDefault) return p;
      if (seen) return { ...p, isDefault: false };
      seen = true;
      return p;
    });
  } catch {
    return [];
  }
}

export function storePresets(list: SavedSearch[]): boolean {
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function presetFilters(filters: Filters): PresetFilters {
  const { origin, radiusKm, minTemp, precipMode, maxWind, minSun, category, tolerance } = filters;
  return { origin, radiusKm, minTemp, precipMode, maxWind, minSun, category, tolerance };
}

/** Vorlage anwenden: Zeitraum bleibt, alles andere kommt aus der Vorlage. */
export function applyPreset(filters: Filters, preset: SavedSearch): Filters {
  return { ...filters, ...preset.filters, origin: { ...preset.filters.origin } };
}

/** Entsprechen die Filter (ohne Zeitraum) genau dieser Vorlage? */
export function matchesPreset(filters: Filters, preset: SavedSearch): boolean {
  const a = presetFilters(filters);
  const b = preset.filters;
  return (
    a.origin.id === b.origin.id &&
    Math.abs(a.origin.lat - b.origin.lat) < 1e-6 &&
    Math.abs(a.origin.lon - b.origin.lon) < 1e-6 &&
    a.radiusKm === b.radiusKm &&
    a.minTemp === b.minTemp &&
    a.precipMode === b.precipMode &&
    a.maxWind === b.maxWind &&
    a.minSun === b.minSun &&
    a.category === b.category &&
    a.tolerance === b.tolerance
  );
}

/**
 * Aktuelle Filter als Vorlage speichern. Gleicher Name (ohne Groß-/Kleinschreibung) überschreibt die
 * bestehende Vorlage. Liefert null, wenn kein Startort gewählt ist oder die Liste voll ist.
 */
export function upsertPreset(list: SavedSearch[], name: string, filters: Filters): SavedSearch[] | null {
  const clean = name.trim().slice(0, PRESET_NAME_MAX);
  if (!clean || !hasOrigin(filters.origin)) return null;
  const existing = list.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    return list.map((p) => (p.id === existing.id ? { ...p, name: clean, filters: presetFilters(filters) } : p));
  }
  if (list.length >= MAX_PRESETS) return null;
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return [...list, { id, name: clean, isDefault: false, filters: presetFilters(filters) }];
}

/** Start-Vorlage umschalten (es gibt höchstens eine) */
export function toggleDefault(list: SavedSearch[], id: string): SavedSearch[] {
  const wasDefault = list.find((p) => p.id === id)?.isDefault ?? false;
  return list.map((p) => ({ ...p, isDefault: p.id === id ? !wasDefault : false }));
}

export function removePreset(list: SavedSearch[], id: string): SavedSearch[] {
  return list.filter((p) => p.id !== id);
}

/** Startzustand der App: geteilter Link > Start-Vorlage > leerer Start */
export function initialFilters(search: string, fromQuery: (s: string) => Filters): Filters {
  const base = fromQuery(search);
  if (hasFilterParams(search)) return base;
  const preset = loadPresets().find((p) => p.isDefault);
  return preset ? applyPreset(base, preset) : base;
}
