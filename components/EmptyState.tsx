"use client";

// Screen 5: Smart Empty State – "Fast-Treffer" mit 1-Klick-Filterlockerung.
// Die Server-Antwort enthält nur Art, Anzahl und Filteränderung; die Texte entstehen hier in der gewählten Sprache.

import { CircleDashed, CloudOff, Maximize2, RotateCcw, Sparkles, Thermometer } from "lucide-react";
import { formatWeekdayRange } from "@/lib/dates";
import { fmtDist, fmtPrecip, fmtSpeed, fmtTempSpaced, formatNumber, tr, trn } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";
import { anyTemp, anyWind } from "@/lib/categories";
import { maxPrecipFor, type Relaxation } from "@/lib/search";
import type { Filters } from "@/lib/types";

interface EmptyStateProps {
  filters: Filters;
  relaxations: Relaxation[];
  onApply: (patch: Partial<Filters>) => void;
  onReset: () => void;
}

function criteriaText(filters: Filters): string {
  const parts: string[] = [];
  if (!anyTemp(filters.minTemp)) parts.push(`≥ ${fmtTempSpaced(filters.minTemp)}`);
  const maxP = maxPrecipFor(filters.precipMode);
  if (Number.isFinite(maxP)) parts.push(`${maxP === 0 ? "" : "≤ "}${fmtPrecip(maxP)} ${tr("Regen")}`);
  if (!anyWind(filters.maxWind)) parts.push(`≤ ${fmtSpeed(filters.maxWind)} ${tr("Wind")}`);
  if (filters.minSun > 0) parts.push(`≥ ${formatNumber(filters.minSun)} ${tr("Std. Sonne")}`);
  if (parts.length === 0) return tr("deinem Wunschwetter");
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} ${tr("und")} ${parts[parts.length - 1]}`;
}

const TOLERANCE_NAME = ["Strikt", "Etwas flexibel", "Flexibel"];

/** Überschrift und Hinweis eines Vorschlags in der aktuellen Sprache */
function describe(r: Relaxation, filters: Filters): { label: string; hint: string } {
  const places = trn(r.count, "{n} Ort", "{n} Orte");
  const p = r.patch;
  switch (r.id) {
    case "radius":
      return {
        label: tr("Radius auf {dist} erweitern", { dist: fmtDist(p.radiusKm ?? filters.radiusKm) }),
        hint: tr("{places} mit deinem Wunschwetter", { places }),
      };
    case "temp":
      return {
        label: tr("Mindesttemperatur auf {t} senken", { t: fmtTempSpaced(p.minTemp ?? filters.minTemp) }),
        hint: tr("{places} mit deinem Wunschwetter", { places }),
      };
    case "tolerance":
      return {
        label: tr("Genauigkeit auf „{name}“ stellen", { name: tr(TOLERANCE_NAME[p.tolerance ?? 1]) }),
        hint: tr("{places}, bei denen es nur knapp daneben liegt", { places }),
      };
    case "precip":
      return {
        label: p.precipMode === "any" ? tr("Regen zulassen") : tr("Etwas Regen zulassen (bis {mm})", { mm: fmtPrecip(1) }),
        hint: places,
      };
    case "sun":
      return { label: tr("Weniger Sonne reicht (ab {h} Std.)", { h: formatNumber(p.minSun ?? 0) }), hint: places };
    case "wind":
      return { label: tr("Mehr Wind zulassen (bis {v})", { v: fmtSpeed(p.maxWind ?? filters.maxWind) }), hint: places };
    case "category":
      return { label: tr("Alle Orts-Charaktere zeigen"), hint: places };
  }
}

const PRIMARY: Relaxation["id"][] = ["radius", "temp", "tolerance"];

export default function EmptyState({ filters, relaxations, onApply, onReset }: EmptyStateProps) {
  useI18n();
  const primary = relaxations.filter((r) => PRIMARY.includes(r.id));
  const secondary = relaxations.filter((r) => !PRIMARY.includes(r.id));
  const range = formatWeekdayRange(filters.startDate, filters.endDate);

  return (
    <div className="animate-pop-in rounded-2xl border border-ink-100 bg-white p-5 text-center shadow-soft">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        <CloudOff className="h-7 w-7" />
      </div>
      <h3 className="mt-3 text-lg font-bold text-ink-900">{tr("Hier versteckt sich die Sonne noch")}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-600">
        {tr("Im Umkreis von {dist} um {origin} gibt es für {range} leider keinen Ort mit {criteria}.", {
          dist: fmtDist(filters.radiusKm),
          origin: filters.origin.name,
          range,
          criteria: criteriaText(filters),
        })}
      </p>

      {relaxations.length > 0 ? (
        <>
          <div className="mt-5 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sun-600">
            <Sparkles className="h-3.5 w-3.5" /> {tr("Fast-Treffer – ein Klick genügt")}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {primary.map((r) => {
              const text = describe(r, filters);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onApply(r.patch)}
                  className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-sun-400 to-sun-600 px-4 py-3 text-left text-white shadow-soft transition hover:shadow-lift active:scale-[.99]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                    {r.id === "radius" ? (
                      <Maximize2 className="h-4 w-4" />
                    ) : r.id === "temp" ? (
                      <Thermometer className="h-4 w-4" />
                    ) : (
                      <CircleDashed className="h-4 w-4" />
                    )}
                  </span>
                  <span>
                    <span className="block text-sm font-bold leading-tight">{text.label}</span>
                    <span className="block text-[12.5px] text-white/90">{text.hint}</span>
                  </span>
                </button>
              );
            })}
            {secondary.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onApply(r.patch)}
                className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-left text-sm transition hover:border-sun-400 hover:bg-sun-50"
              >
                <span className="font-semibold text-ink-800">{describe(r, filters).label}</span>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {trn(r.count, "{n} Ort", "{n} Orte")}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-ink-50 px-3 py-2 text-[13px] text-ink-600">
          {tr("Auch mit einer einzelnen Lockerung finden wir nichts – probiere einen anderen Zeitraum oder setze die Filter zurück.")}
        </p>
      )}

      <button
        type="button"
        onClick={onReset}
        className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
      >
        <RotateCcw className="h-3.5 w-3.5" /> {tr("Alle Filter zurücksetzen")}
      </button>
    </div>
  );
}
