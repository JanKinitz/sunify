"use client";

// Screen 6: Merkliste (Favoriten) & "Trip teilen".

import { useEffect } from "react";
import { BadgeCheck, ChevronRight, Heart, MessageCircle, Share2, Trash2, X } from "lucide-react";
import { formatRange, formatWeekdayRange } from "@/lib/dates";
import { fmtDist, fmtPrecip, tempValue, tr, trn } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";
import { describeDestination } from "@/lib/search";
import type { Destination, Filters } from "@/lib/types";
import { weatherEmoji } from "@/lib/weather";

interface FavoritesDrawerProps {
  favorites: Destination[];
  filters: Filters;
  /** Treffer der aktuellen Suche (id → Übereinstimmung) */
  matchInfo: Record<number, { pct: number; strict: boolean }>;
  shareUrl: string;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
  onShare: () => void;
  onClose: () => void;
}

export default function FavoritesDrawer({
  favorites,
  filters,
  matchInfo,
  shareUrl,
  onSelect,
  onRemove,
  onShare,
  onClose,
}: FavoritesDrawerProps) {
  useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const range = formatWeekdayRange(filters.startDate, filters.endDate);
  const whatsappText = `${tr("Schau mal, wo am {range} unser Wunschwetter ist ☀️", { range: formatRange(filters.startDate, filters.endDate) })} ${shareUrl}`;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={tr("Merkliste")}>
      <button
        type="button"
        aria-label={tr("Merkliste schließen")}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-900/45 backdrop-blur-[2px]"
      />
      <div className="relative mt-16 flex h-[calc(100dvh-4rem)] w-full animate-slide-in-up flex-col rounded-t-3xl bg-ink-50 shadow-lift sm:mt-0 sm:h-full sm:max-w-[420px] sm:animate-slide-in-right sm:rounded-none">
        <header className="flex items-center justify-between border-b border-ink-100 bg-white px-5 py-4 max-sm:rounded-t-3xl">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <Heart className="h-5 w-5 fill-rose-500 text-rose-500" /> {tr("Meine Merkliste")}
            </h2>
            <p className="text-xs text-ink-500">
              {trn(favorites.length, "{n} Ort", "{n} Orte")} · {tr("Wetter für {range}", { range: formatRange(filters.startDate, filters.endDate) })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr("Schließen")}
            className="rounded-full p-2 text-ink-500 transition hover:bg-ink-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="thin-scroll flex-1 overflow-y-auto p-4">
          {favorites.length === 0 ? (
            <div className="mt-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-400">
                <Heart className="h-7 w-7" />
              </div>
              <h3 className="mt-3 font-bold text-ink-900">{tr("Noch nichts gemerkt")}</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500">
                {tr("Tippe bei einem Ort auf das Herz, um ihn für dein Wochenende vorzumerken.")}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {favorites.map((dest) => {
                const m = matchInfo[dest.id];
                const info = describeDestination(dest, filters, m);
                return (
                  <li key={dest.id} className="rounded-2xl border border-ink-100 bg-white p-3 shadow-soft">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => onSelect(dest.id)} className="min-w-0 text-left">
                        <div className="flex items-center gap-1.5 text-[15px] font-bold text-ink-900">
                          <span>{dest.emoji}</span>
                          <span className="truncate">{dest.name}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                        </div>
                        <div className="text-xs text-ink-500">
                          {dest.area} · {tr("{dist} entfernt", { dist: fmtDist(info.distanceKm) })}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(dest.id)}
                        aria-label={tr("{name} entfernen", { name: dest.name })}
                        title={tr("Entfernen")}
                        className="rounded-lg p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                      {m && m.strict ? (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                          <BadgeCheck className="h-3.5 w-3.5" /> {tr("Treffer für {range}", { range })}
                        </span>
                      ) : m ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                          {tr("Fast-Treffer: {pct} %", { pct: m.pct })}
                        </span>
                      ) : (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-600">
                          {tr("Aktuell kein Treffer")}
                        </span>
                      )}
                      {info.days.slice(0, 3).map((day) => (
                        <span key={day.date} className="tabular-nums text-ink-700">
                          {weatherEmoji(day.weatherCode)} {tempValue(day.tempMax)}°
                        </span>
                      ))}
                      <span className="text-ink-400">· {fmtPrecip(info.totalPrecip)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-ink-100 bg-white p-4">
          <p className="mb-2 text-xs text-ink-500">
            {tr("Suche teilen – der Link enthält alle gesetzten Wetterfilter.")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onShare}
              className="flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-700"
            >
              <Share2 className="h-4 w-4" /> {tr("Link kopieren")}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-[#25d366] px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
