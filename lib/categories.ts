// Orts-Charakter → Merkmale (Tags) in der Datenbank. Ohne weitere Importe, damit Server und Client
// dieselbe Zuordnung nutzen können.

import type { Category, TagKey } from "./types";

export const CATEGORY_TAGS: Record<Exclude<Category, "all">, TagKey[]> = {
  mountains: ["mountains", "hiking"],
  water: ["lake", "coast"],
  historic: ["historic", "culture"],
  wine: ["wine"],
  wellness: ["wellness"],
};

/** Grenzen der Wetter-Regler. Am Anschlag bedeutet der Regler „egal“ (kein Kriterium). */
export const TEMP_MIN = -5;
export const TEMP_MAX = 35;
export const WIND_MIN = 5;
export const WIND_MAX = 60;
export const SUN_MAX = 12;

/** Temperatur-Regler ganz links: keine Mindesttemperatur */
export const anyTemp = (minTemp: number) => minTemp <= TEMP_MIN;
/** Wind-Regler ganz rechts: keine Windgrenze */
export const anyWind = (maxWind: number) => maxWind >= WIND_MAX;

export const CATEGORIES: Category[] = ["all", "mountains", "water", "historic", "wine", "wellness"];

/** Spielraum je Toleranzstufe – identisch mit der SQL-Funktion search_destinations_v2 */
export const TOLERANCE_SLACK = {
  0: { temp: 0, precip: 0, wind: 0, sun: 0 },
  1: { temp: 2, precip: 1, wind: 10, sun: 1.5 },
  2: { temp: 3, precip: 3, wind: 15, sun: 2.5 },
} as const;
