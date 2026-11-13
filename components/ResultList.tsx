"use client";

// Screen 3: Ergebnis-Listenansicht mit Sortierung und Orts-Ergebniskarten (mit Foto, Treffer-Grad).

import { useState } from "react";
import { ArrowUpDown, BadgeCheck, ChevronDown, ChevronRight, CircleDashed, Heart, MapPinned } from "lucide-react";
import { formatWeekdayRange, weekdayShort } from "@/lib/dates";
import { groupResults } from "@/lib/grouping";
import { fmtDist, fmtPrecip, fmtSpeed, fmtTemp, formatNumber, tr, trn } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";
import { commonsPage, commonsThumb } from "@/lib/photos";
import { checkDay } from "@/lib/search";
import type { Destination, Filters, SearchResult, SortKey } from "@/lib/types";
import { weatherEmoji } from "@/lib/weather";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Beste Empfehlung" },
  { key: "temp", label: "Höchste Temperatur" },
  { key: "sun", label: "Meiste Sonnenstunden" },
  { key: "distance", label: "Kürzeste Entfernung" },
  { key: "population", label: "Einwohnerzahl" },
];

/** Farbverlauf nach Orts-Charakter – Hintergrund, wenn es kein Foto gibt, und Tönung über dem Foto. */
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
  useI18n();
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white py-1.5 pl-2 pr-1 text-xs text-ink-600">
      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      <span className="sr-only">{tr("Sortieren nach")}</span>
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        className="cursor-pointer bg-transparent text-xs font-medium text-ink-800 outline-none"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {tr(o.label)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Kopfbereich mit Foto (falls vorhanden) und Quellenangabe. */
export function PhotoHeader({
  destination,
  height,
  children,
  creditClassName = "",
}: {
  destination: Destination;
  height: string;
  children: React.ReactNode;
  creditClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const image = !failed ? destination.image : null;
  return (
    <div className={`relative ${height} overflow-hidden bg-gradient-to-br ${destinationGradient(destination)} text-white`}>
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={commonsThumb(image.file, 640)}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/55" />
          <a
            href={commonsPage(image.file)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`absolute bottom-1 right-2 z-10 max-w-[70%] truncate text-[9.5px] text-white/80 hover:text-white hover:underline ${creditClassName}`}
            title={`${image.author} · ${image.license} · Wikimedia Commons`}
          >
            {tr("Foto")}: {image.author} · {image.license}
          </a>
        </>
      ) : (
        <span className="pointer-events-none absolute -bottom-3 right-12 select-none text-6xl opacity-30">
          {destination.emoji}
        </span>
      )}
      <div className="relative h-full">{children}</div>
    </div>
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
  /** Weitere Treffer am selben Wetter-Rasterpunkt */
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
  const strict = result.strict !== false;

  return (
    <article
      data-testid="result-card"
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
      className={`group overflow-hidden rounded-2xl border bg-white transition ${
        highlighted ? "border-sun-400 shadow-lift ring-2 ring-sun-200" : "border-ink-100 shadow-soft hover:shadow-lift"
      }`}
    >
      <PhotoHeader destination={d} height={d.image ? "h-[120px]" : "h-[76px]"}>
        <div className="flex h-full flex-col justify-between px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate rounded-full bg-black/30 px-2.5 py-1 text-[11.5px] font-semibold backdrop-blur-sm">
              {d.area} • {tr("{d} entfernt", { d: fmtDist(result.distanceKm) })}
            </span>
            <button
              type="button"
              onClick={() => onToggleFavorite(d.id)}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? tr("{name} von der Merkliste entfernen", { name: d.name }) : tr("{name} merken", { name: d.name })}
              title={isFavorite ? tr("Von der Merkliste entfernen") : tr("Auf die Merkliste")}
              className="shrink-0 rounded-full bg-white/90 p-1.5 text-ink-700 shadow-soft transition hover:scale-110 active:scale-95"
            >
              <Heart className={`h-4 w-4 ${isFavorite ? "fill-rose-500 text-rose-500" : ""}`} />
            </button>
          </div>
          <div className="flex gap-1.5 pr-24 text-[11px] font-medium text-white/95 drop-shadow">
            {d.hashtags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        </div>
      </PhotoHeader>

      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-[17px] font-bold leading-tight text-ink-900">{d.name}</h3>
          <span className="shrink-0 text-xs text-ink-400">
            {d.adminRegion} · {d.countryCode}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-ink-500">{d.teaser}</p>

        {/* Wetter-Match-Badge */}
        <div className={`mt-3 rounded-xl px-3 py-2 ${strict ? "bg-emerald-50" : "bg-amber-50"}`}>
          <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${strict ? "text-emerald-700" : "text-amber-700"}`}>
            {strict ? <BadgeCheck className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
            {strict
              ? tr("100 % Treffer für {range}", { range: rangeLabel })
              : tr("Fast-Treffer: {pct} % Übereinstimmung", { pct: result.matchPct ?? 0 })}
          </div>
          <div className={`mt-0.5 text-[12.5px] tabular-nums ${strict ? "text-emerald-900/80" : "text-amber-900/80"}`}>
            Ø {fmtTemp(result.avgTempMax)} | {fmtPrecip(result.totalPrecip)} {tr("Regen")} | {fmtSpeed(result.maxWind)} {tr("Wind")} | Ø{" "}
            {tr("{h} Std. Sonne", { h: formatNumber(result.avgSunshine) })}
          </div>
        </div>

        {/* Mini-Tagesvorschau (gelb umrandet: Tag weicht im Toleranzbereich ab) */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {visibleDays.map((day) => {
            const ok = checkDay(day, filters).allOk;
            return (
              <span
                key={day.date}
                className={`rounded-lg border px-2 py-1 text-[12.5px] tabular-nums text-ink-800 ${
                  ok ? "border-ink-100 bg-ink-50" : "border-amber-300 bg-amber-50"
                }`}
              >
                <span className="font-semibold">{weekdayShort(day.date)}:</span> {weatherEmoji(day.weatherCode)}{" "}
                {fmtTemp(day.tempMax)}
              </span>
            );
          })}
          {hiddenDays > 0 && (
            <span className="rounded-lg px-1.5 py-1 text-[12.5px] text-ink-400">
              +{trn(hiddenDays, "{n} Tag", "{n} Tage")}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSelect(d.id)}
          className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sun-600 active:scale-[.99]"
        >
          {tr("Details & Unterkünfte")}
          <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Weitere Orte am selben Rasterpunkt */}
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
                {others.length === 1 ? tr("weiterer Ort mit ähnlichem Wetter in der Nähe") : tr("weitere Orte mit ähnlichem Wetter in der Nähe")}
              </span>
              <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-ink-400 transition ${expanded ? "rotate-180" : ""}`} />
            </button>
            {onShowOnMap && (
              <button
                type="button"
                onClick={() => onShowOnMap([d.id, ...others.map((o) => o.destination.id)])}
                title={tr("Diese Orte auf der Karte zeigen")}
                aria-label={tr("Diese Orte auf der Karte zeigen")}
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
                    className={`flex items-center gap-1 rounded-lg transition ${highlightId === o.id ? "bg-sun-100" : "hover:bg-white"}`}
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
                          {tr("{d} entfernt", { d: fmtDist(other.distanceKm) })} · Ø {fmtTemp(other.avgTempMax)}
                          {o.hashtags.length > 0 && ` · ${o.hashtags.map((t) => `#${t}`).join(" ")}`}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(o.id)}
                      aria-pressed={fav}
                      aria-label={fav ? tr("{name} von der Merkliste entfernen", { name: o.name }) : tr("{name} merken", { name: o.name })}
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
  useI18n();
  const groups = groupResults(results);
  const firstNear = groups.findIndex((g) => g.lead.strict === false);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, index) => {
        const ids = [group.lead.destination.id, ...group.others.map((o) => o.destination.id)];
        return (
          <div key={group.key} className="flex flex-col gap-3">
            {index === firstNear && (
              <div className="mt-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                <CircleDashed className="h-3.5 w-3.5" />
                {index === 0 ? tr("Keine vollen Treffer – diese Orte passen fast") : tr("Fast-Treffer")}
              </div>
            )}
            <ResultCard
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
          </div>
        );
      })}
    </div>
  );
}
