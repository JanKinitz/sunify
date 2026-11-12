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

export const CATEGORIES: Category[] = ["all", "mountains", "water", "historic", "wine", "wellness"];

/** Spielraum je Toleranzstufe – identisch mit der SQL-Funktion search_destinations_v2 */
export const TOLERANCE_SLACK = {
  0: { temp: 0, precip: 0, wind: 0, sun: 0 },
  1: { temp: 2, precip: 1, wind: 10, sun: 1.5 },
  2: { temp: 3, precip: 3, wind: 15, sun: 2.5 },
} as const;
