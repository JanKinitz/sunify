"use client";

// Screen 1: Such- & Filter-Cockpit (Standort, Radius, Zeitraum, Wetter-Parameter, Orts-Charakter).

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CloudRain,
  LocateFixed,
  MapPin,
  RotateCcw,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";
import { geocodePlaces } from "@/lib/geocode";
import { POPULAR_ORIGINS } from "@/lib/origins";
import {
  addDays,
  formatRange,
  lastForecastISO,
  rangeForPreset,
  todayISO,
} from "@/lib/dates";
import { SUN_MAX, TEMP_MAX, TEMP_MIN, WIND_MAX, WIND_MIN } from "@/lib/filters";
import { RADIUS_MAX, RADIUS_MIN, RADIUS_STEP } from "@/lib/search";
import type { Category, DatePreset, Filters, Origin, PrecipMode } from "@/lib/types";
import { tempColor, tempLabel, windLabel } from "@/lib/weather";

interface FilterPanelProps {
  filters: Filters;
  resultCount: number;
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
          {title}
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

function OriginField({
  origin,
  onSelect,
  onNotify,
}: {
  origin: Origin;
  onSelect: (origin: Origin) => void;
  onNotify: (message: string) => void;
}) {
  const [query, setQuery] = useState(origin.name);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [remote, setRemote] = useState<Origin[] | null>(null);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(origin.name), [origin.name]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(origin.name);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [origin.name]);

  const needle = query.trim().toLowerCase();
  const isSearch = open && needle.length >= 2 && needle !== origin.name.toLowerCase();

  // Live-Geocoding (Photon) mit kurzer Eingabe-Verzögerung
  useEffect(() => {
    if (!isSearch) {
      setRemote(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      geocodePlaces(needle, controller.signal)
        .then((places) => {
          setRemote(places);
          setSearching(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setRemote(null); // Rückfall auf die lokale Liste
          setSearching(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isSearch, needle]);

  const local =
    needle === "" || needle === origin.name.toLowerCase()
      ? POPULAR_ORIGINS
      : POPULAR_ORIGINS.filter((o) => o.name.toLowerCase().includes(needle));
  const suggestions = isSearch && remote !== null ? remote : local;

  const pick = (o: Origin) => {
    onSelect(o);
    setQuery(o.name);
    setOpen(false);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      onNotify("Dein Browser unterstützt keine Standortabfrage.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        pick({
          id: "gps",
          name: "Mein Standort",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        onNotify("Standort übernommen 📍");
      },
      () => {
        setLocating(false);
        onNotify("Standort konnte nicht ermittelt werden – bitte Ort auswählen.");
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={query}
            aria-label="Startort"
            placeholder="Startort eingeben …"
            autoComplete="off"
            onFocus={(e) => {
              setOpen(true);
              e.target.select();
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions.length > 0) pick(suggestions[0]);
              if (e.key === "Escape") setOpen(false);
            }}
            className="w-full rounded-xl border border-ink-200 bg-ink-50 py-2.5 pl-9 pr-3 text-sm font-medium outline-none transition focus:border-sun-400 focus:bg-white focus:ring-2 focus:ring-sun-200"
          />
        </div>
        <button
          type="button"
          onClick={locate}
          title="GPS-Standort nutzen"
          aria-label="GPS-Standort nutzen"
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 transition hover:border-sun-400 hover:text-sun-600"
        >
          <LocateFixed className={`h-4 w-4 ${locating ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline lg:hidden xl:inline">GPS</span>
        </button>
      </div>
      {open && (
        <ul className="thin-scroll absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-ink-100 bg-white py-1 shadow-lift">
          {suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-400">
              {searching ? "Suche …" : "Kein Ort gefunden"}
            </li>
          )}
          {suggestions.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => pick(o)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sun-50 ${
                  o.id === origin.id ? "font-semibold text-sun-700" : "text-ink-800"
                }`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                <span className="truncate">
                  {o.name}
                  {o.detail && <span className="ml-1.5 text-xs font-normal text-ink-400">{o.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
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
  const today = todayISO();
  const lastDay = lastForecastISO();

  const choosePreset = (preset: DatePreset) => {
    if (preset === "custom") onChange({ datePreset: "custom" });
    else onChange({ datePreset: preset, ...rangeForPreset(preset) });
  };

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      {/* Standort & Radius */}
      <Section icon={<MapPin className="h-4 w-4" />} title="Standort & Radius">
        <OriginField origin={filters.origin} onSelect={(origin) => onChange({ origin })} onNotify={onNotify} />
        <div className="mt-4">
          <RangeField
            label="Suchradius"
            valueLabel={`${filters.radiusKm} km`}
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step={RADIUS_STEP}
            value={filters.radiusKm}
            minLabel="50 km"
            maxLabel="500 km"
            onChange={(radiusKm) => onChange({ radiusKm })}
          />
        </div>
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
                {p.label}
              </button>
            );
          })}
        </div>
        {filters.datePreset === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-2 animate-fade-in">
            <label className="text-xs text-ink-500">
              Von
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
              Bis
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
              Prognosen sind für die nächsten 14 Tage verfügbar (bis {addDays(today, 13).split("-").reverse().join(".")}).
            </p>
          </div>
        )}
      </Section>

      {/* Wetter-Parameter */}
      <Section icon={<Sun className="h-4 w-4" />} title="Dein Wunschwetter">
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Thermometer className="h-3.5 w-3.5" /> Temperatur
            </div>
            <RangeField
              label="Mindestens (Tageshöchstwert)"
              valueLabel={`${filters.minTemp} °C`}
              hint={tempLabel(filters.minTemp)}
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
              <CloudRain className="h-3.5 w-3.5" /> Niederschlag
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-100 p-1" role="radiogroup" aria-label="Niederschlag">
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
                    <span className="block text-[12.5px] font-semibold leading-tight">{opt.label}</span>
                    <span className="block text-[11px] text-ink-400">{opt.sub}</span>
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
              label="Maximal"
              valueLabel={`${filters.maxWind} km/h`}
              hint={windLabel(filters.maxWind)}
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
              <Sun className="h-3.5 w-3.5" /> Sonnenstunden
            </div>
            <RangeField
              label="Mindestens pro Tag"
              valueLabel={`${filters.minSun} Std.`}
              hint={filters.minSun === 0 ? "Egal" : undefined}
              min={0}
              max={SUN_MAX}
              value={filters.minSun}
              color="#f5a70a"
              onChange={(minSun) => onChange({ minSun })}
            />
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-sun-50 px-3 py-2 text-[11.5px] leading-snug text-sun-800">
          Gilt für <strong>jeden einzelnen Tag</strong> im gewählten Zeitraum.
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
                {c.label}
              </button>
            );
          })}
        </div>
      </Section>

      <div className="flex items-center justify-between px-1 pb-2 text-sm">
        <span className="font-medium text-ink-600">
          {resultCount === 0 ? "Keine Treffer" : `${resultCount} Treffer`}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Filter zurücksetzen
        </button>
      </div>
    </div>
  );
}
