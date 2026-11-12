// Mehrsprachigkeit (Deutsch/Englisch) und Einheiten (metrisch/imperial).
// Der deutsche Text dient als Schlüssel: tr("Merkliste") liefert auf Englisch "Saved places".
// Sprache und Einheiten liegen zusätzlich auf Modulebene, damit auch Hilfsfunktionen außerhalb von
// React-Komponenten (Datumsformate, Wetterbeschreibungen) die aktuelle Einstellung kennen.

import { EN } from "./i18n-en";

export type Locale = "de" | "en";
export type Units = "metric" | "imperial";

let currentLocale: Locale = "de";
let currentUnits: Units = "metric";

/** Nur für den I18nProvider: setzt Sprache/Einheiten auf Modulebene. */
export function applySettings(locale: Locale, units: Units): void {
  currentLocale = locale;
  currentUnits = units;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function getUnits(): Units {
  return currentUnits;
}

/** Übersetzt einen deutschen Text; {name}-Platzhalter werden ersetzt. */
export function tr(key: string, vars?: Record<string, string | number>): string {
  let text = currentLocale === "en" ? (EN[key] ?? key) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}

/** Wählt Singular oder Plural (beide als deutsche Schlüssel). */
export function trn(n: number, one: string, many: string, vars?: Record<string, string | number>): string {
  return tr(n === 1 ? one : many, { n: formatInt(n), ...vars });
}

// ---------------------------------------------------------------------------
// Zahlen und Einheiten (intern wird immer metrisch gerechnet)
// ---------------------------------------------------------------------------

const numberLocale = () => (currentLocale === "en" ? "en-GB" : "de-DE");

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString(numberLocale());
}

/** Datum "2026-11-27" als 27.11.2026 bzw. 27 Nov 2026 */
export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(currentLocale === "en" ? "en-GB" : "de-DE", { day: "numeric", month: currentLocale === "en" ? "short" : "2-digit", year: "numeric" });
}

export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString(numberLocale(), { maximumFractionDigits: digits });
}

export const imperial = () => currentUnits === "imperial";

export function tempValue(celsius: number): number {
  return imperial() ? Math.round((celsius * 9) / 5 + 32) : Math.round(celsius);
}
export const tempUnit = () => (imperial() ? "°F" : "°C");
/** "18°C" bzw. "64°F" */
export const fmtTemp = (celsius: number) => `${tempValue(celsius)}${tempUnit()}`;
/** "18 °C" bzw. "64 °F" */
export const fmtTempSpaced = (celsius: number) => `${tempValue(celsius)} ${tempUnit()}`;

export const distUnit = () => (imperial() ? "mi" : "km");
export const distValue = (km: number) => (imperial() ? Math.round(km * 0.621371) : Math.round(km));
export const fmtDist = (km: number) => `${formatInt(distValue(km))} ${distUnit()}`;

export const speedUnit = () => (imperial() ? "mph" : "km/h");
export const speedValue = (kmh: number) => (imperial() ? Math.round(kmh * 0.621371) : Math.round(kmh));
export const fmtSpeed = (kmh: number) => `${speedValue(kmh)} ${speedUnit()}`;

export function fmtPrecip(mm: number): string {
  if (imperial()) return `${formatNumber(mm / 25.4, 2)} in`;
  return `${formatNumber(mm, 1)} mm`;
}

