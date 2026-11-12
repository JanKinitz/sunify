// Freitext-Suche (Regel-Parser, Deutsch und Englisch).
// Ein einfacher, lokaler Parser übersetzt typische Formulierungen in Filterwerte.
// Später kann er durch eine KI-Auswertung (LLM mit Structured Output) ersetzt werden –
// die Rückgabe-Struktur (Teil-Filter + erkannte Begriffe) bleibt gleich.

import { POPULAR_ORIGINS } from "./origins";
import { seasonalNormals } from "./season";
import { rangeForPreset } from "./dates";
import { TEMP_MAX, TEMP_MIN, WIND_MAX, WIND_MIN, SUN_MAX } from "./filters";
import { fmtDist, fmtSpeed, fmtTempSpaced, getLocale, imperial, tempValue, tr } from "./i18n";
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
  if (/n(ä|ae)chste[sn]?\s+wochenende|übernächst|next\s+weekend/.test(t)) {
    Object.assign(patch, { datePreset: "nextWeekend", ...rangeForPreset("nextWeekend") });
    recognized.push(tr("Nächstes Wochenende"));
  } else if (/\bmorgen\b|\btomorrow\b/.test(t)) {
    Object.assign(patch, { datePreset: "tomorrow", ...rangeForPreset("tomorrow") });
    recognized.push(tr("Morgen"));
  } else if (/wochenende|\bsa\b|samstag|sonntag|\bso\b|weekend|saturday|sunday|\bsat\b|\bsun\b/.test(t)) {
    Object.assign(patch, { datePreset: "weekend", ...rangeForPreset("weekend") });
    recognized.push(tr("Dieses Wochenende"));
  }

  // Radius (km oder Meilen)
  const dist = t.match(/(\d{2,3})\s*(km|miles?|meilen|mi)(?![a-z/])/);
  if (dist) {
    const km = dist[2] === "km" ? Number(dist[1]) : Number(dist[1]) * 1.609344;
    patch.radiusKm = clamp(Math.round(km / 10) * 10, RADIUS_MIN, RADIUS_MAX);
    recognized.push(tr("{dist} Umkreis", { dist: fmtDist(patch.radiusKm) }));
  }

  // Temperatur (°C, °F; ohne Buchstaben gilt die eingestellte Einheit)
  const temp = t.match(/(-?\d{1,3})\s*(°\s*[cf]?|grad|degrees?|celsius|fahrenheit)/);
  if (temp) {
    const unit = temp[2];
    const fahrenheit = /f/.test(unit) || (!/c|grad/.test(unit) && imperial());
    const celsius = fahrenheit ? ((Number(temp[1]) - 32) * 5) / 9 : Number(temp[1]);
    patch.minTemp = clamp(Math.round(celsius), TEMP_MIN, TEMP_MAX);
    recognized.push(tr("mind. {t}", { t: fmtTempSpaced(patch.minTemp) }));
  } else if (/\bwarm|sommerlich|summery|\bhot\b/.test(t)) {
    patch.minTemp = clamp(Math.round(seasonalNormals().tempMax + 4), TEMP_MIN, TEMP_MAX);
    recognized.push(tr("warm (mind. {t})", { t: fmtTempSpaced(patch.minTemp) }));
  } else if (/\bmild\b/.test(t)) {
    patch.minTemp = clamp(Math.round(seasonalNormals().tempMax + 2), TEMP_MIN, TEMP_MAX);
    recognized.push(tr("mild (mind. {t})", { t: fmtTempSpaced(patch.minTemp) }));
  }

  // Niederschlag
  if (/fast trocken|kaum regen|wenig regen|mostly dry|little rain|hardly any rain/.test(t)) {
    patch.precipMode = "almost";
    recognized.push(tr("fast trocken"));
  } else if (/trocken|kein(en)? regen|ohne regen|regenfrei|\bdry\b|no rain|rain-free/.test(t)) {
    patch.precipMode = "dry";
    recognized.push(tr("100 % trocken"));
  } else if (/regen egal|rain is fine|any rain|don'?t mind rain/.test(t)) {
    patch.precipMode = "any";
    recognized.push(tr("Regen egal"));
  }

  // Wind
  const wind = t.match(/(\d{1,2})\s*(km\/h|kmh|mph)/);
  if (wind) {
    const kmh = wind[2] === "mph" ? Number(wind[1]) * 1.609344 : Number(wind[1]);
    patch.maxWind = clamp(Math.round(kmh), WIND_MIN, WIND_MAX);
    recognized.push(tr("max. {v} Wind", { v: fmtSpeed(patch.maxWind) }));
  } else if (/windstill|kein wind|no wind|\bcalm\b/.test(t)) {
    patch.maxWind = 10;
    recognized.push(tr("windstill"));
  } else if (/wenig wind|kaum wind|leichte brise|little wind|light breeze|not windy/.test(t)) {
    patch.maxWind = 20;
    recognized.push(tr("wenig Wind"));
  }

  // Sonne
  const sun = t.match(/(\d{1,2})\s*(std|stunden|h|hours?|hrs?)\b[^.]*(sonne|sun)|(\d{1,2})\s*(sonnenstunden|sunshine hours|hours of sun)/);
  if (sun) {
    patch.minSun = clamp(Number(sun[1] ?? sun[4]), 0, SUN_MAX);
    recognized.push(tr("mind. {h} Std. Sonne", { h: patch.minSun }));
  } else if (/viel sonne|sonnig|sonne satt|sunny|lots of sun|plenty of sun/.test(t)) {
    patch.minSun = clamp(Math.round(seasonalNormals().maxSun * 0.6), 0, SUN_MAX);
    recognized.push(tr("sonnig (mind. {h} Std.)", { h: patch.minSun }));
  }

  // Orts-Charakter
  if (/wander|berg|natur|alpen|hik|mountain|nature|alps/.test(t)) {
    patch.category = "mountains";
    recognized.push(tr("Berge & Natur"));
  } else if (/\bsee\b|wasser|baden|ufer|\blake|water|swim|beach|strand|küste|coast/.test(t)) {
    patch.category = "water";
    recognized.push(tr("Am Wasser / See"));
  } else if (/wein|winzer|wine|vineyard/.test(t)) {
    patch.category = "wine";
    recognized.push(tr("Weinregionen"));
  } else if (/therme|wellness|\bspa\b|sauna/.test(t)) {
    patch.category = "wellness";
    recognized.push(tr("Wellness & Thermen"));
  } else if (/altstadt|stadt|kultur|historisch|städtetrip|old town|city|culture|historic/.test(t)) {
    patch.category = "historic";
    recognized.push(tr("Historische Städte"));
  }

  // Startort ("ab München", "von Köln", "from Munich")
  const origin = POPULAR_ORIGINS.find((o) => {
    const names = [o.name, tr(o.name)].map((n) => n.toLowerCase().split(" ")[0]);
    return names.some((n) => new RegExp(`\\b(ab|von|um|aus|from|near|around)\\s+${n}`).test(t));
  });
  if (origin) {
    patch.origin = { ...origin, name: tr(origin.name) };
    recognized.push(tr("ab {name}", { name: tr(origin.name) }));
  }

  return { patch, recognized };
}

/** Jahreszeitlich passende Beispiel-Prompts für die Chips unter der Suchleiste. */
export function examplePrompts(): { label: string; prompt: string }[] {
  const base = Math.round(seasonalNormals().tempMax);
  const deg = (c: number) => `${tempValue(c)} ${imperial() ? "°F" : "°C"}`;
  const d = (km: number) => (imperial() ? `${Math.round((km * 0.621371) / 10) * 10} miles` : `${km} km`);
  if (getLocale() === "en") {
    return [
      { label: "🥾 Dry hiking weekend", prompt: `Sat & Sun dry, at least ${deg(base + 1)}, little wind, max. ${d(200)} for hiking` },
      { label: "⛵ Sunny by the lake", prompt: `This weekend sunny at a lake, at least ${deg(base)}, up to ${d(300)}` },
      { label: "🍷 Mild wine weekend", prompt: `Next weekend mild and mostly dry in a wine region, max. ${d(250)}` },
      { label: "🏰 City trip tomorrow", prompt: `Tomorrow no rain, at least ${deg(base + 2)}, old town and culture, ${d(150)}` },
    ];
  }
  return [
    { label: "🥾 Trockenes Wander-Wochenende", prompt: `Sa & So trocken, mind. ${deg(base + 1)}, wenig Wind, max. ${d(200)} zum Wandern` },
    { label: "⛵ Sonnig am See", prompt: `Dieses Wochenende sonnig am See, mind. ${deg(base)}, bis ${d(300)}` },
    { label: "🍷 Mildes Wein-Wochenende", prompt: `Nächstes Wochenende mild und fast trocken in einer Weinregion, max. ${d(250)}` },
    { label: "🏰 Städtetrip morgen", prompt: `Morgen kein Regen, mind. ${deg(base + 2)}, Altstadt und Kultur, ${d(150)}` },
  ];
}
