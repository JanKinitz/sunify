// UI-SIMULATION der KI-Freitextsuche (Phase 0).
// Ein einfacher, lokaler Regel-Parser übersetzt typische Formulierungen in Filterwerte.
// In Phase 4 wird diese Funktion durch POST /api/ai-parse-query (LLM mit Structured Output)
// ersetzt – die Rückgabe-Struktur (Teil-Filter + erkannte Begriffe) bleibt gleich.

import { POPULAR_ORIGINS } from "./origins";
import { seasonalNormals } from "./season";
import { rangeForPreset } from "./dates";
import { TEMP_MAX, TEMP_MIN, WIND_MAX, WIND_MIN, SUN_MAX } from "./filters";
import { RADIUS_MAX, RADIUS_MIN } from "./search";
import type { Filters } from "./types";

export interface ParsedPrompt {
  patch: Partial<Filters>;
  recognized: string[];
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function parsePrompt(text: string): ParsedPrompt {
  const t = text.toLowerCase();
  const patch: Partial<Filters> = {};
  const recognized: string[] = [];

  // Zeitraum
  if (/n(ä|ae)chste[sn]?\s+wochenende|übernächst/.test(t)) {
    Object.assign(patch, { datePreset: "nextWeekend", ...rangeForPreset("nextWeekend") });
    recognized.push("Nächstes Wochenende");
  } else if (/\bmorgen\b/.test(t)) {
    Object.assign(patch, { datePreset: "tomorrow", ...rangeForPreset("tomorrow") });
    recognized.push("Morgen");
  } else if (/wochenende|\bsa\b|samstag|sonntag|\bso\b/.test(t)) {
    Object.assign(patch, { datePreset: "weekend", ...rangeForPreset("weekend") });
    recognized.push("Dieses Wochenende");
  }

  // Radius
  const km = t.match(/(\d{2,3})\s*km(?!\/h)/);
  if (km) {
    patch.radiusKm = clamp(Math.round(Number(km[1]) / 10) * 10, RADIUS_MIN, RADIUS_MAX);
    recognized.push(`${patch.radiusKm} km Umkreis`);
  }

  // Temperatur
  const temp = t.match(/(-?\d{1,2})\s*(°|grad)/);
  if (temp) {
    patch.minTemp = clamp(Number(temp[1]), TEMP_MIN, TEMP_MAX);
    recognized.push(`mind. ${patch.minTemp} °C`);
  } else if (/\bwarm|sommerlich\b/.test(t)) {
    patch.minTemp = clamp(Math.round(seasonalNormals().tempMax + 4), TEMP_MIN, TEMP_MAX);
    recognized.push(`warm (mind. ${patch.minTemp} °C)`);
  } else if (/\bmild\b/.test(t)) {
    patch.minTemp = clamp(Math.round(seasonalNormals().tempMax + 2), TEMP_MIN, TEMP_MAX);
    recognized.push(`mild (mind. ${patch.minTemp} °C)`);
  }

  // Niederschlag
  if (/fast trocken|kaum regen|wenig regen/.test(t)) {
    patch.precipMode = "almost";
    recognized.push("fast trocken");
  } else if (/trocken|kein(en)? regen|ohne regen|regenfrei/.test(t)) {
    patch.precipMode = "dry";
    recognized.push("100 % trocken");
  } else if (/regen egal/.test(t)) {
    patch.precipMode = "any";
    recognized.push("Regen egal");
  }

  // Wind
  const wind = t.match(/(\d{1,2})\s*km\/h/);
  if (wind) {
    patch.maxWind = clamp(Number(wind[1]), WIND_MIN, WIND_MAX);
    recognized.push(`max. ${patch.maxWind} km/h Wind`);
  } else if (/windstill|kein wind/.test(t)) {
    patch.maxWind = 10;
    recognized.push("windstill");
  } else if (/wenig wind|kaum wind|leichte brise/.test(t)) {
    patch.maxWind = 20;
    recognized.push("wenig Wind");
  }

  // Sonne
  const sun = t.match(/(\d{1,2})\s*(std|stunden|h)\b[^.]*sonne|(\d{1,2})\s*sonnenstunden/);
  if (sun) {
    patch.minSun = clamp(Number(sun[1] ?? sun[3]), 0, SUN_MAX);
    recognized.push(`mind. ${patch.minSun} Std. Sonne`);
  } else if (/viel sonne|sonnig|sonne satt/.test(t)) {
    patch.minSun = clamp(Math.round(seasonalNormals().maxSun * 0.6), 0, SUN_MAX);
    recognized.push(`sonnig (mind. ${patch.minSun} Std.)`);
  }

  // Orts-Charakter
  if (/wander|berg|natur|alpen/.test(t)) {
    patch.category = "mountains";
    recognized.push("Berge & Natur");
  } else if (/\bsee\b|wasser|baden|ufer/.test(t)) {
    patch.category = "water";
    recognized.push("Am Wasser / See");
  } else if (/wein|winzer/.test(t)) {
    patch.category = "wine";
    recognized.push("Weinregionen");
  } else if (/altstadt|stadt|kultur|historisch|städtetrip/.test(t)) {
    patch.category = "historic";
    recognized.push("Historische Städte");
  }

  // Startort ("ab München", "von Köln")
  const origin = POPULAR_ORIGINS.find((o) =>
    new RegExp(`\\b(ab|von|um|aus)\\s+${o.name.toLowerCase().split(" ")[0]}`).test(t)
  );
  if (origin) {
    patch.origin = origin;
    recognized.push(`ab ${origin.name}`);
  }

  return { patch, recognized };
}

/** Jahreszeitlich passende Beispiel-Prompts für die Chips unter der KI-Suchleiste. */
export function examplePrompts(): { label: string; prompt: string }[] {
  const base = Math.round(seasonalNormals().tempMax);
  return [
    {
      label: "🥾 Trockenes Wander-Wochenende",
      prompt: `Sa & So trocken, mind. ${base + 1} °C, wenig Wind, max. 200 km zum Wandern`,
    },
    {
      label: "⛵ Sonnig am See",
      prompt: `Dieses Wochenende sonnig am See, mind. ${base} °C, bis 300 km`,
    },
    {
      label: "🍷 Mildes Wein-Wochenende",
      prompt: `Nächstes Wochenende mild und fast trocken in einer Weinregion, max. 250 km`,
    },
    {
      label: "🏰 Städtetrip morgen",
      prompt: `Morgen kein Regen, mind. ${base + 2} °C, Altstadt und Kultur, 150 km`,
    },
  ];
}
