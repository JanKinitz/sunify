"use client";

// Zentrale Client-Komponente: hält den gesamten UI-State (Filter, Sortierung, Auswahl,
// Favoriten) und verdrahtet die 6 Kern-Screens. Seit Phase 3 kommen die Daten von
// POST /api/search (eigene Datenbank) statt aus lokalen Mock-Daten.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudOff, Heart, List, LoaderCircle, Map as MapIcon, Share2, SlidersHorizontal, X } from "lucide-react";
import { fetchSearch, type SearchData } from "@/lib/api";
import { formatRange, formatWeekdayRange } from "@/lib/dates";
import { defaultFilters, filtersFromQuery, filtersToQuery } from "@/lib/filters";
import { groupResults } from "@/lib/grouping";
import { describeDestination, sortResults } from "@/lib/search";
import type { Destination, Filters, SearchResult, SortKey } from "@/lib/types";
import AiSearchBar from "./AiSearchBar";
import DetailDrawer from "./DetailDrawer";
import EmptyState from "./EmptyState";
import FavoritesDrawer from "./FavoritesDrawer";
import FilterPanel from "./FilterPanel";
import MapView, { type MapFocusRequest } from "./MapView";
import ResultList, { SortSelect } from "./ResultList";

const FAVORITES_KEY = "sunify:favorites";

function loadFavorites(): number[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === "number") : [];
  } catch {
    return [];
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function SunifyApp() {
  const [filters, setFilters] = useState<Filters>(() => filtersFromQuery(window.location.search));
  const [sort, setSort] = useState<SortKey>("score");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [listHoverId, setListHoverId] = useState<number | null>(null);
  const [mapHoverId, setMapHoverId] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<number[]>(loadFavorites);
  const [showFavorites, setShowFavorites] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocusRequest | null>(null);

  // Suchergebnis der API samt Lade- und Fehlerzustand
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Alle bisher geladenen Orte (für Detailansicht und Merkliste)
  const knownRef = useRef(new Map<number, Destination>());
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setFilters(defaultFilters()), []);

  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // "Suche teilen": aktuelle Filter laufend in die URL-Query-Parameter schreiben
  const query = useMemo(() => filtersToQuery(filters), [filters]);
  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [query]);

  // Favoriten im LocalStorage halten
  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      /* Speicher nicht verfügbar – Merkliste bleibt für diese Sitzung im Speicher */
    }
  }, [favorites]);

  // Suche bei jeder Filteränderung neu ausführen (kurz verzögert, damit Slider flüssig bleiben)
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetchSearch(filters, favoritesRef.current, controller.signal)
        .then((next) => {
          for (const d of next.destinations) knownRef.current.set(d.id, d);
          setData(next);
          setError(null);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setError(cause instanceof Error ? cause.message : "Die Suche ist gerade nicht verfügbar.");
          setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters]);

  // Liste, Detail und Merkliste beziehen sich auf die Filter der zuletzt geladenen Antwort;
  // Radius-Kreis und Startpunkt der Karte folgen den Reglern sofort.
  const activeFilters = data?.filters ?? filters;

  const results = useMemo(() => {
    if (!data) return [] as SearchResult[];
    const list = data.matchIds
      .map((id) => knownRef.current.get(id))
      .filter((d): d is Destination => d !== undefined)
      .map((d) => describeDestination(d, data.filters));
    return sortResults(list, sort);
  }, [data, sort]);

  const others = useMemo(() => {
    if (!data) return [] as SearchResult[];
    return data.otherIds
      .map((id) => knownRef.current.get(id))
      .filter((d): d is Destination => d !== undefined)
      .map((d) => describeDestination(d, data.filters));
  }, [data]);

  const groupCount = useMemo(() => groupResults(results).length, [results]);

  // Aus der Liste: Ortsgruppe auf der Karte zeigen (mobil dazu die Liste einklappen)
  const showOnMap = useCallback((ids: number[]) => {
    setMapFocus((prev) => ({ ids, nonce: (prev?.nonce ?? 0) + 1 }));
    setSheetOpen(false);
  }, []);

  const relaxations = data?.relaxations ?? [];
  const totalMatches = data?.totalMatches ?? 0;

  const selected = useMemo(() => {
    if (selectedId === null) return null;
    const destination = knownRef.current.get(selectedId);
    if (!destination) return null;
    return {
      result: describeDestination(destination, activeFilters),
      match: data?.matchIds.includes(selectedId) ?? false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, data]);

  const favoriteDestinations = useMemo(
    () =>
      favorites
        .map((id) => knownRef.current.get(id))
        .filter((d): d is Destination => d !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [favorites, data]
  );

  const toggleFavorite = useCallback(
    (id: number) => {
      const name = knownRef.current.get(id)?.name ?? "Ort";
      setFavorites((prev) => {
        const exists = prev.includes(id);
        return exists ? prev.filter((v) => v !== id) : [...prev, id];
      });
      notify(favorites.includes(id) ? `${name} von der Merkliste entfernt` : `${name} gemerkt ♥`);
    },
    [favorites, notify]
  );

  // Geteilte Links zeigen immer auf die öffentliche Hauptadresse. Die langen, automatisch erzeugten
  // Vercel-Adressen einzelner Veröffentlichungen sind per Deployment Protection geschützt und
  // verlangen eine Vercel-Anmeldung. Vercel setzt die Variable beim Build automatisch.
  const productionHost = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  const shareOrigin =
    productionHost && window.location.hostname.endsWith(".vercel.app")
      ? `https://${productionHost}`
      : window.location.origin;
  const shareUrl = `${shareOrigin}${window.location.pathname}?${query}`;
  const share = useCallback(async () => {
    const ok = await copyToClipboard(shareUrl);
    notify(ok ? "Link kopiert – ab damit in die WhatsApp-Gruppe! 🔗" : "Link steht in der Adresszeile bereit.");
  }, [shareUrl, notify]);

  const closeDetail = useCallback(() => setSelectedId(null), []);
  const closeFavorites = useCallback(() => setShowFavorites(false), []);

  const rangeLabel = formatWeekdayRange(activeFilters.startDate, activeFilters.endDate);
  const countLabel = `${results.length} Treffer`;
  const initialLoading = loading && !data;

  const listHeader = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 truncate text-[15px] font-bold text-ink-900">
          <span className="truncate">
            {initialLoading
              ? "Suche läuft …"
              : results.length === 0
                ? "Keine Treffer"
                : `${results.length} ${results.length === 1 ? "Ort" : "Orte"} mit Wunschwetter`}
          </span>
          {loading && <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-sun-500" />}
        </h2>
        <p className="truncate text-xs text-ink-500">
          {formatRange(activeFilters.startDate, activeFilters.endDate)} · {activeFilters.radiusKm} km um{" "}
          {activeFilters.origin.name}
          {groupCount > 0 && groupCount < results.length && ` · ${groupCount} ${groupCount === 1 ? "Region" : "Regionen"}`}
          {totalMatches > results.length && ` · Top ${results.length} von ${totalMatches.toLocaleString("de-DE")}`}
        </p>
      </div>
      {results.length > 0 && <SortSelect sort={sort} onSort={setSort} />}
    </div>
  );

  const listBody = initialLoading ? (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-56 animate-pulse rounded-2xl border border-ink-100 bg-white" />
      ))}
    </div>
  ) : error && !data ? (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 text-center shadow-soft">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <CloudOff className="h-7 w-7" />
      </div>
      <h3 className="mt-3 text-lg font-bold text-ink-900">Suche nicht erreichbar</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-600">{error}</p>
      <button
        type="button"
        onClick={() => setFilters((prev) => ({ ...prev }))}
        className="mt-4 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sun-600"
      >
        Erneut versuchen
      </button>
    </div>
  ) : results.length === 0 ? (
      <EmptyState filters={activeFilters} relaxations={relaxations} onApply={update} onReset={reset} />
    ) : (
      <ResultList
        results={results}
        filters={activeFilters}
        highlightId={mapHoverId}
        favorites={favorites}
        onSelect={setSelectedId}
        onHover={setListHoverId}
        onToggleFavorite={toggleFavorite}
        onShowOnMap={showOnMap}
      />
    );

  return (
    <div className="flex h-dvh flex-col overflow-clip bg-ink-50 text-ink-900">
      {/* ------------------------------------------------------------------ */}
      {/* Top-Bar: Logo, KI-Smart-Prompt-Leiste, Teilen & Merkliste          */}
      {/* ------------------------------------------------------------------ */}
      <header className="relative z-30 shrink-0 bg-ink-900 px-3 pb-2.5 pt-3 text-white shadow-lift sm:px-5">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5 lg:flex-nowrap">
          <div className="flex h-10 shrink-0 items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sun-300 to-sun-600 text-xl shadow-soft">
              ☀️
            </span>
            <div className="leading-tight">
              <div className="text-lg font-extrabold tracking-tight">Sunify</div>
              <div className="hidden text-[11px] text-ink-300 sm:block">Finde dein Wunschwetter</div>
            </div>
          </div>

          <div className="order-3 w-full lg:order-2 lg:w-auto lg:flex-1">
            <AiSearchBar onApply={update} />
          </div>

          <div className="order-2 ml-auto flex h-10 shrink-0 items-center gap-2 lg:order-3">
            <button
              type="button"
              onClick={share}
              title="Suchergebnis teilen"
              className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium ring-1 ring-white/10 transition hover:bg-white/20"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Suche teilen</span>
            </button>
            <button
              type="button"
              onClick={() => setShowFavorites(true)}
              title="Merkliste öffnen"
              className="relative flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium ring-1 ring-white/10 transition hover:bg-white/20"
            >
              <Heart className={`h-4 w-4 ${favorites.length > 0 ? "fill-rose-400 text-rose-400" : ""}`} />
              <span className="hidden sm:inline">Merkliste</span>
              {favorites.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold">
                  {favorites.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Hauptbereich: Filter-Cockpit | Karte (60 %) | Ergebnisliste (40 %) */}
      {/* ------------------------------------------------------------------ */}
      <main className="relative flex min-h-0 flex-1 overflow-clip">
        {/* Filter-Cockpit (Desktop) */}
        <aside className="thin-scroll hidden w-[330px] shrink-0 overflow-y-auto border-r border-ink-100 bg-ink-50 lg:block xl:w-[350px]">
          <FilterPanel
            filters={filters}
            resultCount={results.length}
            onChange={update}
            onReset={reset}
            onNotify={notify}
          />
        </aside>

        {/* Karte */}
        <section className="relative isolate min-w-0 flex-1 lg:flex-[3]">
          <MapView
            origin={filters.origin}
            radiusKm={filters.radiusKm}
            matches={results}
            others={others}
            selectedId={selectedId}
            highlightId={listHoverId}
            favorites={favorites}
            focusRequest={mapFocus}
            onSelect={setSelectedId}
            onHover={setMapHoverId}
          />

          {/* Karten-Legende */}
          <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex flex-col items-start gap-2">
            <div className="rounded-xl bg-white/95 px-3 py-2 text-xs shadow-soft backdrop-blur">
              <div className="font-bold text-ink-900">
                {countLabel} · {rangeLabel}
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-sun-500" /> Start
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-4 rounded-full border border-ink-200 bg-white shadow-sm" /> Treffer
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-300" /> passt nicht
                </span>
              </div>
            </div>
          </div>

          {/* Mobile: Filter-Button */}
          <button
            type="button"
            onClick={() => setMobileFilters(true)}
            className="absolute right-3 top-3 z-[1000] flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ink-900 shadow-lift lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4 text-sun-600" /> Filter
          </button>

          {/* Mobile: schwebender Toggle-Button */}
          {!sheetOpen && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="absolute bottom-6 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift transition active:scale-95 lg:hidden"
            >
              <List className="h-4 w-4" /> Liste anzeigen ({countLabel})
            </button>
          )}
        </section>

        {/* Ergebnisliste (Desktop) */}
        <aside className="hidden min-w-[360px] flex-col border-l border-ink-100 bg-ink-50 lg:flex lg:flex-[2]">
          <div className="shrink-0 border-b border-ink-100 bg-white px-4 py-3">{listHeader}</div>
          <div className="thin-scroll flex-1 overflow-y-auto p-4">{listBody}</div>
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* Mobile: ausziehbares Bottom-Sheet mit der Ergebnisliste          */}
        {/* ---------------------------------------------------------------- */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 flex h-[78%] flex-col rounded-t-3xl bg-ink-50 shadow-lift transition-transform duration-300 ease-out lg:hidden ${
            sheetOpen ? "translate-y-0" : "translate-y-full"
          }`}
          aria-hidden={!sheetOpen}
          inert={!sheetOpen}
        >
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Liste einklappen"
            className="flex shrink-0 justify-center pb-1 pt-2.5"
          >
            <span className="h-1.5 w-12 rounded-full bg-ink-200" />
          </button>
          <div className="shrink-0 border-b border-ink-100 px-4 pb-3">{listHeader}</div>
          <div className="thin-scroll flex-1 overflow-y-auto p-3 pb-24">{listBody}</div>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift active:scale-95"
          >
            <MapIcon className="h-4 w-4" /> Karte anzeigen
          </button>
        </div>

        {/* Mobile: Filter-Cockpit als Vollbild-Sheet */}
        {mobileFilters && (
          <div className="absolute inset-0 z-30 flex animate-slide-in-up flex-col bg-ink-50 lg:hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-ink-100 bg-white px-4 py-3">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <SlidersHorizontal className="h-4 w-4 text-sun-600" /> Such- & Filter-Cockpit
              </h2>
              <button
                type="button"
                onClick={() => setMobileFilters(false)}
                aria-label="Filter schließen"
                className="rounded-full p-2 text-ink-500 hover:bg-ink-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="thin-scroll flex-1 overflow-y-auto">
              <FilterPanel
                filters={filters}
                resultCount={results.length}
                onChange={update}
                onReset={reset}
                onNotify={notify}
              />
            </div>
            <div className="shrink-0 border-t border-ink-100 bg-white p-3">
              <button
                type="button"
                onClick={() => setMobileFilters(false)}
                className="w-full rounded-xl bg-sun-500 px-4 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-sun-600"
              >
                {results.length === 0 ? "Keine Treffer – Vorschläge ansehen" : `${countLabel} auf der Karte anzeigen`}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Screen 6: Merkliste */}
      {showFavorites && (
        <FavoritesDrawer
          favorites={favoriteDestinations}
          filters={activeFilters}
          shareUrl={shareUrl}
          onSelect={setSelectedId}
          onRemove={toggleFavorite}
          onShare={share}
          onClose={closeFavorites}
        />
      )}

      {/* Screen 4: Orts-Detailansicht */}
      {selected && (
        <DetailDrawer
          result={selected.result}
          filters={activeFilters}
          isMatch={selected.match}
          isFavorite={favorites.includes(selected.result.destination.id)}
          onToggleFavorite={toggleFavorite}
          onClose={closeDetail}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-fade-in rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-lift"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
