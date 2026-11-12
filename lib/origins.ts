// Häufige Startorte: Vorschläge bei leerem Suchfeld und Rückfall, falls das Geocoding ausfällt.

import type { Origin } from "./types";

export const POPULAR_ORIGINS: Origin[] = [
  { id: "stuttgart", name: "Stuttgart", lat: 48.7758, lon: 9.1829 },
  { id: "muenchen", name: "München", lat: 48.1372, lon: 11.5756 },
  { id: "frankfurt", name: "Frankfurt am Main", lat: 50.1109, lon: 8.6821 },
  { id: "koeln", name: "Köln", lat: 50.9375, lon: 6.9603 },
  { id: "nuernberg", name: "Nürnberg", lat: 49.4521, lon: 11.0767 },
  { id: "karlsruhe", name: "Karlsruhe", lat: 49.0069, lon: 8.4037 },
  { id: "mannheim", name: "Mannheim", lat: 49.4875, lon: 8.466 },
  { id: "ulm", name: "Ulm", lat: 48.4011, lon: 9.9876 },
  { id: "augsburg", name: "Augsburg", lat: 48.3705, lon: 10.8978 },
  { id: "duesseldorf", name: "Düsseldorf", lat: 51.2277, lon: 6.7735 },
  { id: "leipzig", name: "Leipzig", lat: 51.3397, lon: 12.3731 },
  { id: "dresden", name: "Dresden", lat: 51.0504, lon: 13.7373 },
  { id: "berlin", name: "Berlin", lat: 52.52, lon: 13.405 },
  { id: "hamburg", name: "Hamburg", lat: 53.5511, lon: 9.9937 },
  { id: "hannover", name: "Hannover", lat: 52.3759, lon: 9.732 },
  { id: "zuerich", name: "Zürich", lat: 47.3769, lon: 8.5417 },
  { id: "basel", name: "Basel", lat: 47.5596, lon: 7.5886 },
  { id: "bern", name: "Bern", lat: 46.948, lon: 7.4474 },
  { id: "wien", name: "Wien", lat: 48.2082, lon: 16.3738 },
  { id: "salzburg", name: "Salzburg", lat: 47.8095, lon: 13.055 },
  { id: "innsbruck", name: "Innsbruck", lat: 47.2692, lon: 11.4041 },
];

/** Noch kein Startort gewählt (Startzustand der App) */
export const NO_ORIGIN: Origin = { id: "", name: "", lat: 50, lon: 10 };

export function hasOrigin(origin: Origin): boolean {
  return origin.id !== "";
}

/** Anzeigename eines Startorts in der gewählten Sprache (bekannte Städte haben einen Eintrag im Wörterbuch). */
export function originLabel(origin: Origin, translate: (s: string) => string): string {
  return POPULAR_ORIGINS.some((o) => o.id === origin.id) ? translate(origin.name) : origin.name;
}
