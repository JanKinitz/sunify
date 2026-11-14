"use client";

// Start-Leiste in der Top-Bar: Startort (Eingabe mit Vorschlägen oder GPS) und Suchradius.
// Erste Funktion auf dem Startbildschirm – ohne Startort wird nicht gesucht.

import { useEffect, useRef, useState } from "react";
import { CircleDot, LocateFixed, MapPin } from "lucide-react";
import { geocodePlaces } from "@/lib/geocode";
import { fmtDist, tr } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";
import { hasOrigin, originLabel, POPULAR_ORIGINS } from "@/lib/origins";
import type { SavedSearch } from "@/lib/presets";
import type { Filters, Origin } from "@/lib/types";
import SavedSearches from "./SavedSearches";

const RADIUS_OPTIONS = [50, 100, 150, 200, 250, 300, 400, 500];

export function OriginField({
  origin,
  onSelect,
  onNotify,
}: {
  origin: Origin;
  onSelect: (origin: Origin) => void;
  onNotify: (message: string) => void;
}) {
  const shown = originLabel(origin, tr);
  const [query, setQuery] = useState(shown);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [remote, setRemote] = useState<Origin[] | null>(null);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(shown), [shown]);

  // Auf schmalen Bildschirmen ist das Feld kurz: dort nur „Startort“, sonst wird der Text abgeschnitten
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(shown);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [shown]);

  const needle = query.trim().toLowerCase();
  const isSearch = open && needle.length >= 2 && needle !== shown.toLowerCase();

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
    needle === "" || needle === shown.toLowerCase()
      ? POPULAR_ORIGINS
      : POPULAR_ORIGINS.filter((o) => o.name.toLowerCase().includes(needle) || tr(o.name).toLowerCase().includes(needle));
  const suggestions = isSearch && remote !== null ? remote : local;

  const pick = (o: Origin) => {
    onSelect(o);
    setQuery(originLabel(o, tr));
    setOpen(false);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      onNotify(tr("Dein Browser unterstützt keine Standortabfrage."));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        pick({
          id: "gps",
          name: tr("Mein Standort"),
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        onNotify(tr("Standort übernommen 📍"));
      },
      () => {
        setLocating(false);
        onNotify(tr("Standort konnte nicht ermittelt werden – bitte Ort auswählen."));
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sun-400" />
          <input
            id="sunify-origin"
            type="text"
            value={query}
            aria-label={tr("Startort")}
            placeholder={narrow ? tr("Startort") : tr("Startort eingeben …")}
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
            className={`w-full rounded-xl border bg-white/10 py-2.5 pl-9 pr-3 text-[15px] font-medium text-white outline-none transition placeholder:text-ink-300 focus:border-sun-400 focus:bg-white/15 focus:ring-2 focus:ring-sun-400/40 ${
              hasOrigin(origin) ? "border-white/10" : "border-sun-400 ring-2 ring-sun-400/30"
            }`}
          />
        </div>
        <button
          type="button"
          onClick={locate}
          title={tr("GPS-Standort nutzen")}
          aria-label={tr("GPS-Standort nutzen")}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 text-sm font-medium text-white transition hover:border-sun-400 hover:text-sun-300"
        >
          <LocateFixed className={`h-4 w-4 ${locating ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">GPS</span>
        </button>
      </div>
      {open && (
        <ul className="thin-scroll absolute left-0 right-0 top-full z-[1100] mt-1 max-h-56 overflow-y-auto rounded-xl border border-ink-100 bg-white py-1 shadow-lift">
          {suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-400">
              {searching ? tr("Suche …") : tr("Kein Ort gefunden")}
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
                  {tr(o.name)}
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


export default function StartBar({
  filters,
  onChange,
  onNotify,
  presets,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onNotify: (message: string) => void;
  /** „Meine Suchen“ (Vorlagen samt Aktionen) */
  presets: {
    list: SavedSearch[];
    onApply: (preset: SavedSearch) => void;
    onSave: (name: string) => void;
    onToggleDefault: (id: string) => void;
    onRemove: (id: string) => void;
  };
}) {
  useI18n();
  const options = RADIUS_OPTIONS.includes(filters.radiusKm)
    ? RADIUS_OPTIONS
    : [...RADIUS_OPTIONS, filters.radiusKm].sort((a, b) => a - b);
  return (
    <div className="relative flex items-stretch gap-2">
      <div className="min-w-0 flex-1" data-tour="origin">
        <OriginField origin={filters.origin} onSelect={(origin) => onChange({ origin })} onNotify={onNotify} />
      </div>
      <label data-tour="radius" className="relative flex shrink-0 items-center rounded-xl border border-white/10 bg-white/10 pl-2.5 text-white transition focus-within:border-sun-400 hover:border-sun-400">
        <CircleDot className="pointer-events-none h-4 w-4 text-sun-400" aria-hidden="true" />
        <span className="sr-only">{tr("Suchradius")}</span>
        <select
          value={filters.radiusKm}
          onChange={(e) => onChange({ radiusKm: Number(e.target.value) })}
          title={tr("Suchradius")}
          className="h-full cursor-pointer appearance-none bg-transparent py-2.5 pl-1.5 pr-3 text-[15px] font-semibold text-white outline-none"
        >
          {options.map((km) => (
            <option key={km} value={km} className="text-ink-900">
              {tr("{dist} Umkreis", { dist: fmtDist(km) })}
            </option>
          ))}
        </select>
      </label>
      <SavedSearches
        filters={filters}
        presets={presets.list}
        onApply={presets.onApply}
        onSave={presets.onSave}
        onToggleDefault={presets.onToggleDefault}
        onRemove={presets.onRemove}
      />
    </div>
  );
}
