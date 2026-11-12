"use client";

// Screen 4: Orts-Detailansicht & Conversion-Drawer (Slide-Over auf Desktop, Sheet auf Mobile).

import { useEffect } from "react";
import {
  BadgeCheck,
  BedDouble,
  Car,
  Check,
  CircleAlert,
  CloudRain,
  ExternalLink,
  Heart,
  Navigation,
  Sun,
  Tent,
  Thermometer,
  Wind,
  X,
} from "lucide-react";
import { addDays, formatRange, formatShort, weekdayShort, formatDayMonth } from "@/lib/dates";
import { checkDay, formatDriveTime } from "@/lib/search";
import type { DailyForecast, Filters, SearchResult } from "@/lib/types";
import { formatNumber, tempColor, weatherEmoji, weatherLabel } from "@/lib/weather";
import {
  generateAccommodationLink,
  generateAppleMapsRoute,
  generateCampingLink,
  generateGoogleMapsRoute,
  getStayDates,
} from "@/utils/affiliateLinks";
import { destinationGradient } from "./ResultList";

const COUNTRY_NAMES: Record<string, string> = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz" };

interface DetailDrawerProps {
  result: SearchResult;
  filters: Filters;
  isMatch: boolean;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
  onClose: () => void;
}

/** Kleiner Temperaturverlauf (Höchst-/Tiefstwerte) als SVG-Linie. */
function TempChart({ days, selected }: { days: DailyForecast[]; selected: (date: string) => boolean }) {
  if (days.length < 2) return null;
  const W = 320;
  const H = 96;
  const padX = 22;
  const padTop = 20;
  const padBottom = 22;
  const temps = days.flatMap((d) => [d.tempMax, d.tempMin]);
  const min = Math.min(...temps) - 1;
  const max = Math.max(...temps) + 1;
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (days.length - 1);
  const y = (t: number) => padTop + ((max - t) * (H - padTop - padBottom)) / (max - min);
  const line = (key: "tempMax" | "tempMin") => days.map((d, i) => `${x(i)},${y(d[key])}`).join(" ");
  const step = (W - 2 * padX) / (days.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Temperaturverlauf">
      {days.map((d, i) =>
        selected(d.date) ? (
          <rect key={d.date} x={x(i) - step / 2} y={4} width={step} height={H - 8} rx={8} fill="#fff8eb" />
        ) : null
      )}
      <polyline points={line("tempMin")} fill="none" stroke="#38a3e8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line("tempMax")} fill="none" stroke="#f98307" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {days.map((d, i) => (
        <g key={d.date}>
          <circle cx={x(i)} cy={y(d.tempMax)} r={3.5} fill="#fff" stroke="#f98307" strokeWidth={2} />
          <text x={x(i)} y={y(d.tempMax) - 8} textAnchor="middle" fontSize={10} fontWeight={700} fill="#141b2d">
            {Math.round(d.tempMax)}°
          </text>
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={9.5} fill="#5b6c8f">
            {weekdayShort(d.date)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Metric({
  icon,
  value,
  sub,
  state,
}: {
  icon: React.ReactNode;
  value: string;
  sub?: string;
  state: "ok" | "fail" | "neutral";
}) {
  const tone =
    state === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : state === "fail"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-ink-100 bg-ink-50 text-ink-600";
  return (
    <div className={`relative rounded-lg border px-1.5 py-1.5 text-center ${tone}`}>
      <div className="flex items-center justify-center gap-1 text-[12.5px] font-semibold tabular-nums">
        <span className="opacity-70">{icon}</span>
        {value}
      </div>
      {sub && <div className="text-[10px] leading-tight opacity-75">{sub}</div>}
      {state !== "neutral" && (
        <span
          className={`absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-white ${
            state === "ok" ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {state === "ok" ? <Check className="h-2.5 w-2.5" strokeWidth={4} /> : <X className="h-2.5 w-2.5" strokeWidth={4} />}
        </span>
      )}
    </div>
  );
}

export default function DetailDrawer({
  result,
  filters,
  isMatch,
  isFavorite,
  onToggleFavorite,
  onClose,
}: DetailDrawerProps) {
  const d = result.destination;
  // Touristische Region (falls abweichend), Bundesland/Kanton und Land – ohne Doppelungen
  const headerLocation = [d.area, d.adminRegion, COUNTRY_NAMES[d.countryCode] ?? d.countryCode]
    .filter((part, index, all) => part && all.indexOf(part) === index)
    .join(" · ");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Timeline: gewählter Zeitraum inkl. Vor- und Folgetag (sofern in der 14-Tage-Prognose)
  const from = addDays(filters.startDate, -1);
  const to = addDays(filters.endDate, 1);
  const timeline = d.forecasts.filter((f) => f.date >= from && f.date <= to);
  const inRange = (date: string) => date >= filters.startDate && date <= filters.endDate;
  const checks = result.days.map((day) => checkDay(day, filters));
  const passed = checks.filter((c) => c.allOk).length;
  const inRadius = result.distanceKm <= filters.radiusKm;

  const stay = getStayDates(filters.startDate, filters.endDate);
  const bookingUrl = generateAccommodationLink({
    cityName: d.name,
    countryCode: d.countryCode,
    lat: d.lat,
    lon: d.lon,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Details zu ${d.name}`}>
      <button
        type="button"
        aria-label="Details schließen"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-900/45 backdrop-blur-[2px]"
      />
      <div className="thin-scroll relative mt-10 flex h-[calc(100dvh-2.5rem)] w-full animate-slide-in-up flex-col overflow-y-auto rounded-t-3xl bg-ink-50 shadow-lift sm:mt-0 sm:h-full sm:max-w-[480px] sm:animate-slide-in-right sm:rounded-none">
        {/* Kopfbereich */}
        <div className={`relative shrink-0 bg-gradient-to-br ${destinationGradient(d)} px-5 pb-5 pt-4 text-white`}>
          <span className="pointer-events-none absolute -bottom-4 right-4 select-none text-8xl opacity-25">{d.emoji}</span>
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm">
              {headerLocation}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onToggleFavorite(d.id)}
                aria-pressed={isFavorite}
                aria-label={isFavorite ? "Von der Merkliste entfernen" : "Auf die Merkliste"}
                className="rounded-full bg-white/90 p-2 text-ink-700 transition hover:scale-110"
              >
                <Heart className={`h-4 w-4 ${isFavorite ? "fill-rose-500 text-rose-500" : ""}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Schließen"
                className="rounded-full bg-white/90 p-2 text-ink-700 transition hover:scale-110"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <h2 className="mt-4 text-2xl font-extrabold leading-tight">{d.name}</h2>
          <p className="mt-1 max-w-[85%] text-sm text-white/90">{d.teaser}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium">
            <span className="flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5" /> {result.distanceKm} km ab {filters.origin.name}
            </span>
            <span className="flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5" /> ca. {formatDriveTime(result.driveMinutes)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {/* Routenplanung */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={generateGoogleMapsRoute(filters.origin, d)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-2 text-[13px] font-semibold text-ink-800 transition hover:border-sun-400"
            >
              Route in Google Maps <ExternalLink className="h-3.5 w-3.5 text-ink-400" />
            </a>
            <a
              href={generateAppleMapsRoute(filters.origin, d)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-2 text-[13px] font-semibold text-ink-800 transition hover:border-sun-400"
            >
              Route in Apple Maps <ExternalLink className="h-3.5 w-3.5 text-ink-400" />
            </a>
          </div>

          {/* Treffer-Nachweis */}
          {isMatch ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-emerald-800">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-bold">
                  100 % Treffer: {passed} von {checks.length} {checks.length === 1 ? "Tag passt" : "Tagen passen"}
                </p>
                <p className="text-[12.5px] text-emerald-900/80">
                  Alle Kriterien sind an jedem Tag vom {formatRange(filters.startDate, filters.endDate)} erfüllt.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-rose-800">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-bold">
                  Kein Treffer: {passed} von {checks.length} {checks.length === 1 ? "Tag" : "Tagen"} erfüllt alle Kriterien
                </p>
                <p className="text-[12.5px] text-rose-900/80">
                  {!inRadius
                    ? `Der Ort liegt außerhalb deines ${filters.radiusKm}-km-Radius.`
                    : passed === checks.length
                      ? "Das Wetter passt – der Ort entspricht aber nicht dem gewählten Orts-Charakter."
                      : "Rot markierte Werte verfehlen deine Wunschwetter-Kriterien."}
                </p>
              </div>
            </div>
          )}

          {/* Wetter-Timeline */}
          <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-soft">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-600">
              Wetter-Timeline
            </h3>
            <p className="mb-2 text-xs text-ink-400">inkl. Vor- und Folgetag für deine Reiseplanung</p>
            <TempChart days={timeline} selected={inRange} />

            <div className="mt-3 flex flex-col gap-2">
              {timeline.map((day) => {
                const selected = inRange(day.date);
                const c = checkDay(day, filters);
                const state = (ok: boolean): "ok" | "fail" | "neutral" =>
                  selected ? (ok ? "ok" : "fail") : "neutral";
                return (
                  <div
                    key={day.date}
                    className={`rounded-xl border p-2.5 ${
                      selected ? (c.allOk ? "border-emerald-200 bg-white" : "border-rose-200 bg-white") : "border-dashed border-ink-200 bg-ink-50/60"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">{weatherEmoji(day.weatherCode)}</span>
                        <div>
                          <div className="text-sm font-bold leading-tight text-ink-900">
                            {weekdayShort(day.date)}, {formatDayMonth(day.date)}
                          </div>
                          <div className="text-[11.5px] text-ink-500">{weatherLabel(day.weatherCode)}</div>
                        </div>
                      </div>
                      {selected ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            c.allOk ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {c.allOk ? "✓ passt" : "✗ passt nicht"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">
                          {day.date < filters.startDate ? "Vortag" : "Folgetag"}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <Metric
                        icon={<Thermometer className="h-3 w-3" style={{ color: tempColor(day.tempMax) }} />}
                        value={`${Math.round(day.tempMax)}°`}
                        sub={`min ${Math.round(day.tempMin)}°`}
                        state={state(c.tempOk)}
                      />
                      <Metric
                        icon={<CloudRain className="h-3 w-3" />}
                        value={`${formatNumber(day.precip)} mm`}
                        sub={day.precipProb == null ? "Risiko k. A." : `${day.precipProb} % Risiko`}
                        state={state(c.precipOk)}
                      />
                      <Metric
                        icon={<Wind className="h-3 w-3" />}
                        value={`${day.wind}`}
                        sub={day.gusts == null ? "km/h max." : `Böen ${day.gusts} km/h`}
                        state={state(c.windOk)}
                      />
                      <Metric
                        icon={<Sun className="h-3 w-3" />}
                        value={`${formatNumber(day.sunshine)} h`}
                        sub="Sonne"
                        state={state(c.sunOk)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-snug text-ink-400">
              Deine Kriterien: ≥ {filters.minTemp} °C ·{" "}
              {filters.precipMode === "dry" ? "0 mm" : filters.precipMode === "almost" ? "≤ 1 mm" : "Regen egal"} · ≤{" "}
              {filters.maxWind} km/h Wind · ≥ {filters.minSun} Std. Sonne – an jedem Tag.
            </p>
          </section>

          {/* Conversion Box */}
          <section className="overflow-hidden rounded-2xl border-2 border-sun-300 bg-gradient-to-b from-sun-50 to-white shadow-soft">
            <div className="p-4">
              <div className="flex items-center gap-2 text-sun-700">
                <BedDouble className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wide">Unterkunft sichern</span>
              </div>
              <h3 className="mt-1.5 text-base font-bold leading-snug text-ink-900">
                Passende Unterkünfte in {d.name} für {formatShort(stay.checkin)} – {formatShort(stay.checkout)} (
                {stay.nights} {stay.nights === 1 ? "Nacht" : "Nächte"})
              </h3>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#003b95] px-4 py-3.5 text-center text-sm font-bold leading-snug text-white shadow-soft transition hover:bg-[#002a6b] active:scale-[.99]"
              >
                Jetzt verfügbare Hotels & Ferienwohnungen auf Booking.com prüfen
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
              <a
                href={generateCampingLink(d.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-center text-[13px] font-semibold text-ink-800 transition hover:border-sun-400"
              >
                <Tent className="h-4 w-4 text-ink-500" />
                Camping- & Wohnmobilstellplätze in der Nähe suchen
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-400" />
              </a>
            </div>
            <p className="border-t border-sun-100 bg-white/70 px-4 py-2 text-[11px] text-ink-400">
              Anzeige · Datum und Ort sind bereits vorausgefüllt. Bei einer Buchung erhält Sunify ggf. eine Provision.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
