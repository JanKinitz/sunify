// Saisonale Normalwerte für jahreszeitlich sinnvolle Filter-Voreinstellungen und Beispiel-Prompts.

import { parseISO, todayISO } from "./dates";

/** Mittlere Tageshöchsttemperatur im DACH-Flachland je Monat (Jan–Dez). */
const MONTH_TEMP = [3, 5, 10, 15, 19, 22, 25, 24, 20, 14, 8, 4];
/** Maximal mögliche Sonnenstunden je Monat (Jan–Dez). */
const MONTH_SUN = [6.5, 8, 10, 12, 13.5, 14.5, 14, 13, 11, 9, 7, 6];

export function seasonalNormals(iso: string = todayISO()) {
  const month = parseISO(iso).getMonth();
  return { tempMax: MONTH_TEMP[month], maxSun: MONTH_SUN[month] };
}
