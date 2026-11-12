"use client";

// Screen 3: Ergebnis-Listenansicht mit Sortierung und Orts-Ergebniskarten.

import { useState } from "react";
import { ArrowUpDown, BadgeCheck, ChevronDown, ChevronRight, Heart, MapPinned } from "lucide-react";
import { formatWeekdayRange, weekdayShort } from "@/lib/dates";
import { groupResults } from "@/lib/grouping";
import type { Destination, Filters, SearchResult, SortKey } from "@/lib/types";
import { formatNumber, weatherEmoji } from "@/lib/weather";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Beste Empfehlung" },
  { key: "temp", label: "Höchste Temperatur" },
  { key: "sun", label: "Meiste Sonnenstunden" },
  { key: "distance", label: "Kürzeste Entfernung" },
  { key: "population", label: "Einwohnerzahl" },
];

/** Atmosphären-Header: Farbverlauf nach Orts-Charakter (Platzhalter für spätere Fotos). */
export function destinationGradient(destination: Destination): string {
  const primary = destination.tags[0];
  switch (primary) {
    case "lake":
    case "coast":
      return "from-sky-400 via-cyan-500 to-teal-500";
    case "mountains":
    case "hiking":
      return "from-emerald-500 via-teal-600 to-cyan-700";
    case "wine":
      return "from-rose-400 via-fuchsia-500 to-purple-600";
    case "wellness":
      return "from-violet-400 via-indigo-500 to-blue-600";
    default:
      return "from-amber-400 via-orange-500 to-rose-500";
  }
}

export function SortSelect({ sort, onSort }: { sort: SortKey; onSort: (sort: SortKey) => void }) {
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white py-1.5 pl-2 pr-1 text-xs text-ink-600">
      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      <span className="sr-only">Sortieren nach</span>
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        className="cursor-pointer bg-transparent text-xs font-medium text-ink-800 outline-none"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ResultCardProps {
  result: SearchResult;
  filters: Filters;
  highlighted: boolean;
  isFavorite: boolean;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  onToggleFavorite: (id: number) => void;
  /** Weitere Treffer am selben Wetter-Rasterpunkt (identisches Wetter) */
  others?: SearchResult[];
  favorites?: number[];
  highlightId?: number | null;
  onShowOnMap?: (ids: number[]) => void;
}

export function ResultCard({
  result,
  filters,
  highlighted,
  isFavorite,
  onSelect,
  onHover,
  onToggleFavorite,
  others = [],
  favorites = [],
  highlightId = null,
  onShowOnMap,
}: ResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const d = result.destination;
  const rangeLabel = formatWeekdayRange(filters.startDate, filters.endDate);
  const visibleDays = result.days.slice(0, 4);
  const hiddenDays = result.days.length - visibleDays.length;

  return (
    <article
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
      className={`group overflow-hidden rounded-2xl border bg-white transition ${
        highlighted ? "border-sun-400 shadow-lift ring-2 ring-sun-200" : "border-ink-100 shadow-soft hover:shadow-lift"
      }`}
    >
      {/* Atmosphären-Header */}
      <div className={`relative h-[76px] bg-gradient-to-br ${destinationGradient(d)} px-4 py-3 text-white`}>
        <span className="pointer-events-none absolute -bottom-3 right-12 select-none text-6xl opacity-30">
          {d.emoji}
        </span>
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-full bg-black/25 px-2.5 py-1 text-[11.5px] font-semibold backdrop-blur-sm">
            {d.area} • {result.distanceKm} km entfernt
          </span>
          <button
            type="button"
            onClick={() => onToggleFavorite(d.id)}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `${d.name} von der Merkliste entfernen` : `${d.name} merken`}
            title={isFavorite ? "Von der Merkliste entfernen" : "Auf die Merkliste"}
            className="rounded-full bg-white/90 p-1.5 text-ink-700 shadow-soft transition hover:scale-110 active:scale-95"
          >
            <Heart className={`h-4 w-4 ${isFavorite ? "fill-rose-500 text-rose-500" : ""}`} />
          </button>
        </div>
        <div className="mt-2 flex gap-1.5 text-[11px] font-medium text-white/90">
          {d.hashtags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-[17px] font-bold leading-tight text-ink-900">{d.name}</h3>
          <span className="shrink-0 text-xs text-ink-400">
            {d.adminRegion} · {d.countryCode}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-ink-500">{d.teaser}</p>

        {/* Wetter-Match-Badge */}
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
            <BadgeCheck className="h-4 w-4" />
            100 % Treffer für {rangeLabel}
          </div>
          <div className="mt-0.5 text-[12.5px] tabular-nums text-emerald-900/80">
            Ø {formatNumber(result.avgTempMax, 0)} °C | {formatNumber(result.totalPrecip)} mm Regen |{" "}
            {result.maxWind} km/h Wind | Ø {formatNumber(result.avgSunshine)} Std. Sonne
          </div>
        </div>

        {/* Mini-Tagesvorschau */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {visibleDays.map((day) => (
            <span
              key={day.date}
              className="rounded-lg border border-ink-100 bg-ink-50 px-2 py-1 text-[12.5px] tabular-nums text-ink-800"
            >
              <span className="font-semibold">{weekdayShort(day.date)}:</span> {weatherEmoji(day.weatherCode)}{" "}
              {Math.round(day.tempMax)}°C
            </span>
          ))}
          {hiddenDays > 0 && (
            <span className="rounded-lg px-1.5 py-1 text-[12.5px] text-ink-400">
              +{hiddenDays} {hiddenDays === 1 ? "Tag" : "Tage"}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSelect(d.id)}
          className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sun-600 active:scale-[.99]"
        >
          Details & Unterkünfte
          <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Weitere Orte mit identischem Wetter (gleicher Rasterpunkt) */}
      {others.length > 0 && (
        <div className="border-t border-ink-100 bg-ink-50/70">
          <div className="flex items-center gap-1 px-2 py-1.5">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold text-ink-700 transition hover:bg-ink-100"
            >
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-sun-500 px-1.5 text-xs font-bold text-white">
                +{others.length}
              </span>
              <span className="truncate">
                {others.length === 1 ? "weiterer Ort" : "weitere Orte"} mit gleichem Wetter in der Nähe
              </span>
              <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-ink-400 transition ${expanded ? "rotate-180" : ""}`} />
            </button>
            {onShowOnMap && (
              <button
                type="button"
                onClick={() => onShowOnMap([d.id, ...others.map((o) => o.destination.id)])}
                title="Diese Orte auf der Karte zeigen"
                aria-label="Diese Orte auf der Karte zeigen"
                className="shrink-0 rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 hover:text-sun-600"
              >
                <MapPinned className="h-4 w-4" />
              </button>
            )}
          </div>
          {expanded && (
            <ul className="animate-fade-in px-2 pb-2">
              {others.map((other) => {
                const o = other.destination;
                const fav = favorites.includes(o.id);
                return (
                  <li
                    key={o.id}
                    onMouseEnter={() => onHover(o.id)}
                    onMouseLeave={() => onHover(d.id)}
                    className={`flex items-center gap-1 rounded-lg transition ${
                      highlightId === o.id ? "bg-sun-100" : "hover:bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(o.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                    >
                      <span className="w-5 shrink-0 text-center text-sm">{o.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink-900">{o.name}</span>
                        <span className="block truncate text-[11.5px] text-ink-500">
                          {other.distanceKm} km entfernt
                          {o.hashtags.length > 0 && ` · ${o.hashtags.map((t) => `#${t}`).join(" ")}`}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(o.id)}
                      aria-pressed={fav}
                      aria-label={fav ? `${o.name} von der Merkliste entfernen` : `${o.name} merken`}
                      className="shrink-0 rounded-lg p-2 text-ink-400 transition hover:text-rose-500"
                    >
                      <Heart className={`h-4 w-4 ${fav ? "fill-rose-500 text-rose-500" : ""}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

interface ResultListProps {
  results: SearchResult[];
  filters: Filters;
  highlightId: number | null;
  favorites: number[];
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  onToggleFavorite: (id: number) => void;
  onShowOnMap: (ids: number[]) => void;
}

export default function ResultList({
  results,
  filters,
  highlightId,
  favorites,
  onSelect,
  onHover,
  onToggleFavorite,
  onShowOnMap,
}: ResultListProps) {
  // Orte mit identischem Wetter (gleicher Rasterpunkt) zu einer Karte bündeln
  const groups = groupResults(results);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const ids = [group.lead.destination.id, ...group.others.map((o) => o.destination.id)];
        return (
          <ResultCard
            key={group.key}
            result={group.lead}
            filters={filters}
            highlighted={highlightId !== null && ids.includes(highlightId)}
            isFavorite={favorites.includes(group.lead.destination.id)}
            onSelect={onSelect}
            onHover={onHover}
            onToggleFavorite={onToggleFavorite}
            others={group.others}
            favorites={favorites}
            highlightId={highlightId}
            onShowOnMap={onShowOnMap}
          />
        );
      })}
    </div>
  );
}
