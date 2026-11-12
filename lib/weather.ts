// Darstellung von WMO-Wettercodes und Farbskalen für die UI.

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
  if (code === 0) return "Sonnig";
  if (code === 1) return "Überwiegend sonnig";
  if (code === 2) return "Wolkig mit Sonne";
  if (code === 3) return "Bedeckt";
  if (code === 45 || code === 48) return "Nebel";
  if (code >= 51 && code <= 57) return "Nieselregen";
  if (code === 61) return "Leichter Regen";
  if (code >= 63 && code <= 67) return "Regen";
  if (code >= 71 && code <= 77) return "Schneefall";
  if (code >= 80 && code <= 82) return "Schauer";
  if (code >= 95) return "Gewitter";
  return "Bewölkt";
}

/** Farbskala kühl (blau) → warm (orange) für Temperaturen. */
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
  if (kmh < 10) return "Windstill";
  if (kmh < 20) return "Leichte Brise";
  if (kmh < 30) return "Mäßiger Wind";
  if (kmh < 45) return "Frischer Wind";
  return "Wind egal";
}

export function tempLabel(temp: number): string {
  if (temp < 5) return "Frostig";
  if (temp < 10) return "Kühl";
  if (temp < 15) return "Frisch";
  if (temp < 20) return "Mild";
  if (temp < 25) return "Warm";
  return "Sommerlich";
}

export function formatTemp(value: number): string {
  return `${Math.round(value)}°C`;
}

export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: digits });
}
