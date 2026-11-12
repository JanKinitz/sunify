// Bündelt Suchtreffer für die Listenansicht.
// Orte am selben Wetter-Rasterpunkt haben identische Prognosen – sie werden deshalb zu einer
// Karte zusammengefasst: der beste Ort als Hauptkarte, die übrigen aufklappbar darunter.

import type { SearchResult } from "./types";

export interface ResultGroup {
  key: string;
  lead: SearchResult;
  others: SearchResult[];
}

/** Gruppiert in der gegebenen Reihenfolge; der erste Ort eines Rasterpunkts führt die Gruppe an. */
export function groupResults(results: SearchResult[]): ResultGroup[] {
  const groups = new Map<string, ResultGroup>();
  for (const result of results) {
    const gridId = result.destination.gridId;
    const key = gridId === undefined ? `d${result.destination.id}` : `g${gridId}`;
    const existing = groups.get(key);
    if (existing) existing.others.push(result);
    else groups.set(key, { key, lead: result, others: [] });
  }
  return [...groups.values()];
}
