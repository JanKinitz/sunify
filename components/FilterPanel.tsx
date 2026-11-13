"use client";

// Screen 1: Such- & Filter-Cockpit (Profile, Zeitraum, Wetter-Parameter, Toleranz, Orts-Charakter).
// Startort und Suchradius stehen in der Top-Bar (StartBar.tsx).

import {
  CalendarDays,
  CloudRain,
  MapPin,
  RotateCcw,
  Sparkles,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";
import { fmtPrecip, fmtSpeed, fmtTempSpaced, formatDate, tr, trn } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";
import { hasOrigin } from "@/lib/origins";
import { anyTemp, anyWind } from "@/lib/categories";
import { activeProfile, PROFILES } from "@/lib/profiles";
import {
  addDays,
  formatRange,
  lastForecastISO,
  rangeForPreset,
  todayISO,
} from "@/lib/dates";
import { SUN_MAX, TEMP_MAX, TEMP_MIN, WIND_MAX, WIND_MIN } from "@/lib/filters";
import type { Category, DatePreset, Filters, PrecipMode, Tolerance } from "@/lib/types";
import { tempColor, tempLabel, windLabel } from "@/lib/weather";

interface FilterPanelProps {
  filters: Filters;
  /** null = Suche läuft gerade */
  resultCount: number | null;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
  onNotify: (message: string) => void;
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "weekend", label: "Dieses Wochenende" },
  { key: "nextWeekend", label: "Nächstes Wochenende" },
  { key: "tomorrow", label: "Morgen" },
  { key: "custom", label: "Individuell" },
];

const PRECIP_OPTIONS: { key: PrecipMode; label: string; sub: string }[] = [
  { key: "dry", label: "100 % trocken", sub: "0 mm" },
  { key: "almost", label: "Fast trocken", sub: "≤ 1 mm" },
  { key: "any", label: "Egal", sub: "Regen ok" },
];

const CATEGORY_OPTIONS: { key: Category; label: string }[] = [
  { key: "all", label: "Alle Orte" },
  { key: "mountains", label: "⛰️ Berge & Natur" },
  { key: "water", label: "🌊 Am Wasser / See" },
  { key: "historic", label: "🏰 Historische Städte" },
  { key: "wine", label: "🍇 Weinregionen" },
  { key: "wellness", label: "♨️ Wellness & Thermen" },
];

const TOLERANCE_OPTIONS: { key: Tolerance; label: string; sub: string }[] = [
  { key: 0, label: "Strikt", sub: "alles muss passen" },
  { key: 1, label: "Etwas flexibel", sub: "kleiner Spielraum" },
  { key: 2, label: "Flexibel", sub: "auch Ausreißer-Tage" },
];

function Section({
  icon,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-soft">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-600">
          <span className="text-sun-500">{icon}</span>
          {tr(title)}
        </h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function RangeField({
  label,
  valueLabel,
  hint,
  min,
  max,
  step = 1,
  value,
  color,
  variant,
  minLabel,
  maxLabel,
  onChange,
}: {
  label: string;
  valueLabel: string;
  hint?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  color?: string;
  variant?: "temp";
  minLabel?: string;
  maxLabel?: string;
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const style = { "--pct": `${pct}%`, "--range-color": color ?? "#f98307" } as React.CSSProperties;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink-700">{label}</span>
        <span className="flex items-baseline gap-2">
          {hint && <span className="text-xs text-ink-400">{hint}</span>}
          <span className="text-base font-bold tabular-nums" style={{ color: color ?? "#141b2d" }}>
            {valueLabel}
          </span>
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        className={`sunify-range ${variant === "temp" ? "is-temp" : ""}`}
        style={style}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {(minLabel || maxLabel) && (
        <div className="mt-1 flex justify-between text-[11px] text-ink-400">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

export default function FilterPanel({
  filters,
  resultCount,
  onChange,
  onReset,
  onNotify,
}: FilterPanelProps) {
  useI18n(); // bei Sprach-/Einheitenwechsel neu zeichnen
  const today = todayISO();
  const lastDay = lastForecastISO();
  const profileId = activeProfile(filters);

  const choosePreset = (preset: DatePreset) => {
    if (preset === "custom") onChange({ datePreset: "custom" });
    else onChange({ datePreset: preset, ...rangeForPreset(preset) });
  };

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      {/* Aktivitäts-Profile */}
      <Section icon={<Sparkles className="h-4 w-4" />} title="Was hast du vor?">
        <div className="grid grid-cols-3 gap-2">
          {PROFILES.map((p) => {
            const active = profileId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(p.build())}
                className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-[12px] font-medium leading-tight transition ${
                  active
                    ? "border-sun-500 bg-sun-50 text-sun-800 shadow-soft"
                    : "border-ink-200 bg-white text-ink-700 hover:border-sun-400"
                }`}
              >
                <span className="text-lg leading-none">{p.emoji}</span>
                {tr(p.label)}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-ink-400">{tr("Setzt passende Wetter-Filter – danach frei anpassbar.")}</p>
      </Section>

      {/* Zeitraum */}
      <Section
        icon={<CalendarDays className="h-4 w-4" />}
        title="Zeitraum"
        aside={
          <span className="text-xs font-medium text-ink-500">
            {formatRange(filters.startDate, filters.endDate)}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => {
            const active = filters.datePreset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={active}
                onClick={() => choosePreset(p.key)}
                className={`rounded-xl border px-2 py-2 text-[13px] font-medium transition ${
                  active
                    ? "border-ink-900 bg-ink-900 text-white shadow-soft"
                    : "border-ink-200 bg-white text-ink-700 hover:border-sun-400"
                }`}
              >
                {tr(p.label)}
              </button>
            );
          })}
        </div>
        {filters.datePreset === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-2 animate-fade-in">
            <label className="text-xs text-ink-500">
              {tr("Von")}
              <input
                type="date"
                min={today}
                max={lastDay}
                value={filters.startDate}
                onChange={(e) => {
                  const startDate = e.target.value;
                  if (!startDate) return;
                  onChange({
                    startDate,
                    endDate: filters.endDate < startDate ? startDate : filters.endDate,
                  });
                }}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50 px-2 py-2 text-sm text-ink-900 outline-none focus:border-sun-400"
              />
            </label>
            <label className="text-xs text-ink-500">
              {tr("Bis")}
              <input
                type="date"
                min={filters.startDate}
                max={lastDay}
                value={filters.endDate}
                onChange={(e) => {
                  const endDate = e.target.value;
                  if (!endDate) return;
                  onChange({
                    endDate,
                    startDate: filters.startDate > endDate ? endDate : filters.startDate,
                  });
                }}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50 px-2 py-2 text-sm text-ink-900 outline-none focus:border-sun-400"
              />
            </label>
            <p className="col-span-2 text-[11px] text-ink-400">
              {tr("Prognosen sind für die nächsten 16 Tage verfügbar (bis {date}).", { date: formatDate(addDays(today, 15)) })}
            </p>
          </div>
        )}
      </Section>

      {/* Wetter-Parameter */}
      <Section icon={<Sun className="h-4 w-4" />} title="Dein Wunschwetter">
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Thermometer className="h-3.5 w-3.5" /> {tr("Temperatur")}
            </div>
            <RangeField
              label={tr("Mindestens (Tageshöchstwert)")}
              valueLabel={anyTemp(filters.minTemp) ? tr("Egal") : `≥ ${fmtTempSpaced(filters.minTemp)}`}
              hint={anyTemp(filters.minTemp) ? undefined : tempLabel(filters.minTemp)}
              min={TEMP_MIN}
              max={TEMP_MAX}
              value={filters.minTemp}
              color={tempColor(filters.minTemp)}
              variant="temp"
              onChange={(minTemp) => onChange({ minTemp })}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <CloudRain className="h-3.5 w-3.5" /> {tr("Niederschlag")}
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-100 p-1" role="radiogroup" aria-label={tr("Niederschlag")}>
              {PRECIP_OPTIONS.map((opt) => {
                const active = filters.precipMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange({ precipMode: opt.key })}
                    className={`rounded-lg px-1 py-1.5 text-center transition ${
                      active ? "bg-white text-ink-900 shadow-soft" : "text-ink-500 hover:text-ink-800"
                    }`}
                  >
                    <span className="block text-[12.5px] font-semibold leading-tight">{tr(opt.label)}</span>
                    <span className="block text-[11px] text-ink-400">{opt.key === "almost" ? `≤ ${fmtPrecip(1)}` : opt.key === "dry" ? fmtPrecip(0) : tr(opt.sub)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Wind className="h-3.5 w-3.5" /> Wind
            </div>
            <RangeField
              label={tr("Maximal")}
              valueLabel={anyWind(filters.maxWind) ? tr("Egal") : fmtSpeed(filters.maxWind)}
              hint={anyWind(filters.maxWind) ? undefined : windLabel(filters.maxWind)}
              min={WIND_MIN}
              max={WIND_MAX}
              step={5}
              value={filters.maxWind}
              color="#0ea5e9"
              onChange={(maxWind) => onChange({ maxWind })}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Sun className="h-3.5 w-3.5" /> {tr("Sonnenstunden")}
            </div>
            <RangeField
              label={tr("Mindestens pro Tag")}
              valueLabel={tr("{h} Std.", { h: filters.minSun })}
              hint={filters.minSun === 0 ? tr("Egal") : undefined}
              min={0}
              max={SUN_MAX}
              value={filters.minSun}
              color="#f5a70a"
              onChange={(minSun) => onChange({ minSun })}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Sparkles className="h-3.5 w-3.5" /> {tr("Wie genau muss es passen?")}
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-100 p-1" role="radiogroup" aria-label={tr("Wie genau muss es passen?")}>
              {TOLERANCE_OPTIONS.map((opt) => {
                const active = filters.tolerance === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange({ tolerance: opt.key })}
                    className={`rounded-lg px-1 py-1.5 text-center transition ${
                      active ? "bg-white text-ink-900 shadow-soft" : "text-ink-500 hover:text-ink-800"
                    }`}
                  >
                    <span className="block text-[12.5px] font-semibold leading-tight">{tr(opt.label)}</span>
                    <span className="block text-[10.5px] leading-tight text-ink-400">{tr(opt.sub)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-sun-50 px-3 py-2 text-[11.5px] leading-snug text-sun-800">
          {filters.tolerance === 0
            ? tr("Gilt für jeden einzelnen Tag im gewählten Zeitraum.")
            : filters.tolerance === 1
              ? tr("Jeder Tag darf knapp abweichen (z. B. 2 °C kälter). Volle Treffer stehen oben.")
              : tr("Größerer Spielraum, und bei längeren Zeiträumen darf ein Tag ganz abweichen.")}
        </p>
      </Section>

      {/* Orts-Charakter */}
      <Section icon={<MapPin className="h-4 w-4" />} title="Orts-Charakter">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => {
            const active = filters.category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ category: c.key })}
                className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                  active
                    ? "border-sun-500 bg-sun-500 text-white"
                    : "border-ink-200 bg-white text-ink-700 hover:border-sun-400"
                }`}
              >
                {tr(c.label)}
              </button>
            );
          })}
        </div>
      </Section>

      <div className="flex items-center justify-between px-1 pb-2 text-sm">
        <span className="font-medium text-ink-600">
          {!hasOrigin(filters.origin)
            ? tr("Startort wählen, um zu suchen")
            : resultCount === null
              ? tr("Suche läuft …")
              : resultCount === 0
                ? tr("Keine Treffer")
                : trn(resultCount, "1 Treffer", "{n} Treffer")}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {tr("Filter zurücksetzen")}
        </button>
      </div>
    </div>
  );
}
