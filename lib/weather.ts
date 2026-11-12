// Darstellung von WMO-Wettercodes, Farbskalen und Beschreibungen für die UI.

import { tr } from "./i18n";

export { formatNumber } from "./i18n";

export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 95) return "⛈️";
  return "☁️";
}

export function weatherLabel(code: number): string {
  if (code === 0) return tr("Sonnig");
  if (code === 1) return tr("Überwiegend sonnig");
  if (code === 2) return tr("Wolkig mit Sonne");
  if (code === 3) return tr("Bedeckt");
  if (code === 45 || code === 48) return tr("Nebel");
  if (code >= 51 && code <= 57) return tr("Nieselregen");
  if (code === 61) return tr("Leichter Regen");
  if (code >= 63 && code <= 67) return tr("Regen");
  if (code >= 71 && code <= 77) return tr("Schneefall");
  if (code >= 80 && code <= 82) return tr("Schauer");
  if (code >= 95) return tr("Gewitter");
  return tr("Bewölkt");
}

/** Farbskala kühl (blau) → warm (orange) für Temperaturen (°C). */
export function tempColor(temp: number): string {
  if (temp < 0) return "#3b82f6";
  if (temp < 6) return "#38a3e8";
  if (temp < 11) return "#22b8cf";
  if (temp < 15) return "#34c38f";
  if (temp < 19) return "#f5b82e";
  if (temp < 24) return "#f98307";
  return "#e5484d";
}

export function windLabel(kmh: number): string {
  if (kmh < 10) return tr("Windstill");
  if (kmh < 20) return tr("Leichte Brise");
  if (kmh < 30) return tr("Mäßiger Wind");
  if (kmh < 45) return tr("Frischer Wind");
  return tr("Wind egal");
}

export function tempLabel(temp: number): string {
  if (temp < 5) return tr("Frostig");
  if (temp < 10) return tr("Kühl");
  if (temp < 15) return tr("Frisch");
  if (temp < 20) return tr("Mild");
  if (temp < 25) return tr("Warm");
  return tr("Sommerlich");
}
