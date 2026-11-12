"use client";

// Screen 5: Smart Empty State – "Fast-Treffer" mit 1-Klick-Filterlockerung.

import { CloudOff, Maximize2, RotateCcw, Sparkles, Thermometer } from "lucide-react";
import { formatWeekdayRange } from "@/lib/dates";
import type { Relaxation } from "@/lib/search";
import type { Filters } from "@/lib/types";

interface EmptyStateProps {
  filters: Filters;
  relaxations: Relaxation[];
  onApply: (patch: Partial<Filters>) => void;
  onReset: () => void;
}

function criteriaText(filters: Filters): string {
  const parts = [`≥ ${filters.minTemp} °C`];
  if (filters.precipMode === "dry") parts.push("0 mm Regen");
  if (filters.precipMode === "almost") parts.push("≤ 1 mm Regen");
  parts.push(`≤ ${filters.maxWind} km/h Wind`);
  if (filters.minSun > 0) parts.push(`≥ ${filters.minSun} Std. Sonne`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} und ${parts[parts.length - 1]}`;
}

export default function EmptyState({ filters, relaxations, onApply, onReset }: EmptyStateProps) {
  const primary = relaxations.filter((r) => r.id === "radius" || r.id === "temp");
  const secondary = relaxations.filter((r) => r.id !== "radius" && r.id !== "temp");
  const range = formatWeekdayRange(filters.startDate, filters.endDate);

  return (
    <div className="animate-pop-in rounded-2xl border border-ink-100 bg-white p-5 text-center shadow-soft">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        <CloudOff className="h-7 w-7" />
      </div>
      <h3 className="mt-3 text-lg font-bold text-ink-900">Hier versteckt sich die Sonne noch</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-600">
        Im {filters.radiusKm}-km-Radius um {filters.origin.name} gibt es für {range} leider keinen Ort
        mit {criteriaText(filters)}.
      </p>

      {relaxations.length > 0 ? (
        <>
          <div className="mt-5 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sun-600">
            <Sparkles className="h-3.5 w-3.5" /> Fast-Treffer – ein Klick genügt
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {primary.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onApply(r.patch)}
                className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-sun-400 to-sun-600 px-4 py-3 text-left text-white shadow-soft transition hover:shadow-lift active:scale-[.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                  {r.id === "radius" ? <Maximize2 className="h-4 w-4" /> : <Thermometer className="h-4 w-4" />}
                </span>
                <span>
                  <span className="block text-sm font-bold leading-tight">{r.label}</span>
                  <span className="block text-[12.5px] text-white/90">{r.hint}</span>
                </span>
              </button>
            ))}
            {secondary.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onApply(r.patch)}
                className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-left text-sm transition hover:border-sun-400 hover:bg-sun-50"
              >
                <span className="font-semibold text-ink-800">{r.label}</span>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {r.count} {r.count === 1 ? "Ort" : "Orte"}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-ink-50 px-3 py-2 text-[13px] text-ink-600">
          Auch mit einer einzelnen Lockerung finden wir nichts – probiere einen anderen Zeitraum oder
          setze die Filter zurück.
        </p>
      )}

      <button
        type="button"
        onClick={onReset}
        className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Alle Filter zurücksetzen
      </button>
    </div>
  );
}
