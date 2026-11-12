// Datums-Helfer. Alle Daten werden als lokale YYYY-MM-DD-Strings geführt,
// um Zeitzonen-Verschiebungen (UTC vs. Europe/Berlin) zu vermeiden.

import { getLocale } from "./i18n";
import type { DatePreset } from "./types";

export const FORECAST_DAYS = 16;

const WEEKDAYS: Record<string, string[]> = {
  de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const WEEKDAYS_LONG: Record<string, string[]> = {
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(iso: string): Date {
  // Mittags-Anker verhindert Sprünge bei Sommer-/Winterzeit-Umstellung
  return new Date(`${iso}T12:00:00`);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(startIso: string, endIso: string): number {
  return Math.round(
    (parseISO(endIso).getTime() - parseISO(startIso).getTime()) / 86400000
  );
}

export function lastForecastISO(): string {
  return addDays(todayISO(), FORECAST_DAYS - 1);
}

export function isValidISO(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(parseISO(value).getTime());
}

export function clampToForecast(iso: string): string {
  const min = todayISO();
  const max = lastForecastISO();
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

/** Liefert Start- und Enddatum für eine Schnellauswahl. */
export function rangeForPreset(preset: Exclude<DatePreset, "custom">): {
  startDate: string;
  endDate: string;
} {
  const today = todayISO();
  if (preset === "tomorrow") {
    const t = addDays(today, 1);
    return { startDate: t, endDate: t };
  }
  const weekday = parseISO(today).getDay(); // 0 = So … 6 = Sa
  let saturday: string;
  let sunday: string;
  if (weekday === 0) {
    // Sonntag: "dieses Wochenende" ist nur noch der heutige Tag
    saturday = today;
    sunday = today;
  } else {
    saturday = addDays(today, 6 - weekday);
    sunday = addDays(saturday, 1);
  }
  if (preset === "nextWeekend") {
    const base = weekday === 0 ? addDays(today, 6) : addDays(saturday, 7);
    return { startDate: base, endDate: addDays(base, 1) };
  }
  return { startDate: saturday, endDate: sunday };
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS[getLocale()][parseISO(iso).getDay()];
}

export function weekdayLong(iso: string): string {
  return WEEKDAYS_LONG[getLocale()][parseISO(iso).getDay()];
}

/** "17.05." */
export function formatDayMonth(iso: string): string {
  const d = parseISO(iso);
  if (getLocale() === "en") {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); // "14 Nov"
  }
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
}

/** "Sa, 17.05." */
export function formatShort(iso: string): string {
  return `${weekdayShort(iso)}, ${formatDayMonth(iso)}`;
}

/** "Sa & So" oder "Sa–Di" oder "Sa" */
export function formatWeekdayRange(startIso: string, endIso: string): string {
  const n = diffDays(startIso, endIso);
  if (n <= 0) return weekdayShort(startIso);
  if (n === 1) return `${weekdayShort(startIso)} & ${weekdayShort(endIso)}`;
  return `${weekdayShort(startIso)}–${weekdayShort(endIso)}`;
}

/** "Sa, 17.05. – So, 18.05." */
export function formatRange(startIso: string, endIso: string): string {
  if (startIso === endIso) return formatShort(startIso);
  return `${formatShort(startIso)} – ${formatShort(endIso)}`;
}

export function datesBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const n = Math.max(0, diffDays(startIso, endIso));
  for (let i = 0; i <= n; i++) out.push(addDays(startIso, i));
  return out;
}
