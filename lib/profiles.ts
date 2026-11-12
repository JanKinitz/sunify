// Aktivitäts-Profile: fertige Wetter-Vorlagen für typische Ausflüge. Ein Klick setzt passende Filter;
// die Temperatur richtet sich nach der Jahreszeit, damit das Profil auch im Winter Treffer liefert.

import { seasonalNormals } from "./season";
import type { Filters } from "./types";

export interface ActivityProfile {
  id: string;
  emoji: string;
  label: string; // deutscher Text (Übersetzungsschlüssel)
  build: () => Partial<Filters>;
}

const base = () => Math.round(seasonalNormals().tempMax);
const sunHours = (share: number) => Math.round(seasonalNormals().maxSun * share);

export const PROFILES: ActivityProfile[] = [
  {
    id: "hiking",
    emoji: "🥾",
    label: "Wandern",
    build: () => ({ category: "mountains", minTemp: base(), precipMode: "almost", maxWind: 30, minSun: sunHours(0.35) }),
  },
  {
    id: "beach",
    emoji: "🏖️",
    label: "Baden & Strand",
    build: () => ({ category: "water", minTemp: Math.max(24, base() + 4), precipMode: "dry", maxWind: 25, minSun: sunHours(0.6) }),
  },
  {
    id: "city",
    emoji: "🏰",
    label: "Städtetrip",
    build: () => ({ category: "historic", minTemp: base() - 1, precipMode: "almost", maxWind: 40, minSun: sunHours(0.2) }),
  },
  {
    id: "bike",
    emoji: "🚴",
    label: "Radfahren",
    build: () => ({ category: "all", minTemp: Math.max(12, base()), precipMode: "dry", maxWind: 20, minSun: sunHours(0.35) }),
  },
  {
    id: "wine",
    emoji: "🍷",
    label: "Wein & Genuss",
    build: () => ({ category: "wine", minTemp: base(), precipMode: "almost", maxWind: 35, minSun: sunHours(0.3) }),
  },
  {
    id: "wellness",
    emoji: "♨️",
    label: "Wellness",
    build: () => ({ category: "wellness", minTemp: base() - 4, precipMode: "any", maxWind: 50, minSun: 0 }),
  },
];

/** Welches Profil passt exakt zu den aktuellen Filtern? (für die Hervorhebung) */
export function activeProfile(filters: Filters): string | null {
  for (const p of PROFILES) {
    const patch = p.build();
    const matches = (Object.keys(patch) as (keyof Filters)[]).every((k) => filters[k] === patch[k]);
    if (matches) return p.id;
  }
  return null;
}
