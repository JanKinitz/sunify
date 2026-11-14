"use client";

// „Meine Suchen“: eigene Vorlagen (Startort, Umkreis, Wunschwetter – ohne Zeitraum).
// Knopf in der Start-Leiste öffnet ein Menü: Vorlage laden, als Start-Vorlage markieren, löschen,
// aktuelle Suche speichern. Gespeichert wird nur im Browser (lib/presets.ts).

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Check, Star, Trash2 } from "lucide-react";
import { anyTemp, anyWind } from "@/lib/categories";
import { fmtDist, fmtSpeed, fmtTempSpaced, tr, trn } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";
import { hasOrigin, originLabel } from "@/lib/origins";
import { matchesPreset, MAX_PRESETS, PRESET_NAME_MAX, type SavedSearch } from "@/lib/presets";
import type { Filters } from "@/lib/types";

// gleiche Texte wie im Filter-Cockpit (vorhandene Übersetzungen)
const CATEGORY_NAMES: Record<string, string> = {
  mountains: "⛰️ Berge & Natur",
  water: "🌊 Am Wasser / See",
  historic: "🏰 Historische Städte",
  wine: "🍇 Weinregionen",
  wellness: "♨️ Wellness & Thermen",
};

/** Kurzbeschreibung einer Vorlage, z. B. „München · 200 km · ab 18 °C · trocken“ */
export function presetSummary(preset: SavedSearch): string {
  const f = preset.filters;
  const parts = [originLabel(f.origin, tr), fmtDist(f.radiusKm)];
  if (!anyTemp(f.minTemp)) parts.push(tr("ab {temp}", { temp: fmtTempSpaced(f.minTemp) }));
  if (f.precipMode === "dry") parts.push(tr("trocken"));
  if (f.precipMode === "almost") parts.push(tr("fast trocken"));
  if (!anyWind(f.maxWind)) parts.push(tr("Wind bis {speed}", { speed: fmtSpeed(f.maxWind) }));
  if (f.minSun > 0) parts.push(trn(f.minSun, "1 Std. Sonne", "{n} Std. Sonne"));
  if (f.category !== "all") parts.push(tr(CATEGORY_NAMES[f.category] ?? f.category));
  if (f.tolerance === 1) parts.push(tr("Etwas flexibel"));
  if (f.tolerance === 2) parts.push(tr("flexibel"));
  return parts.join(" · ");
}

/** Namensvorschlag für eine neue Vorlage */
function suggestName(filters: Filters): string {
  return hasOrigin(filters.origin)
    ? `${originLabel(filters.origin, tr)} ${fmtDist(filters.radiusKm)}`.slice(0, PRESET_NAME_MAX)
    : "";
}

export default function SavedSearches({
  filters,
  presets,
  onApply,
  onSave,
  onToggleDefault,
  onRemove,
}: {
  filters: Filters;
  presets: SavedSearch[];
  onApply: (preset: SavedSearch) => void;
  onSave: (name: string) => void;
  onToggleDefault: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = presets.find((p) => matchesPreset(filters, p)) ?? null;
  const canSave = hasOrigin(filters.origin);
  const exists = presets.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  const full = presets.length >= MAX_PRESETS && !exists;

  useEffect(() => {
    if (!open) return;
    setName(active?.name ?? suggestName(filters));
    setConfirmId(null);
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
    // nur beim Öffnen vorbelegen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    if (!canSave || !name.trim() || full) return;
    onSave(name);
  };

  return (
    <div ref={wrapRef} data-tour="presets" className="flex shrink-0 sm:relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={tr("Meine Suchen")}
        aria-expanded={open}
        data-testid="presets-button"
        data-active={active ? "true" : "false"}
        className={`flex h-full min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition ${
          active
            ? "border-sun-400/60 bg-sun-500/20 text-sun-200 hover:bg-sun-500/30"
            : "border-white/10 bg-white/10 text-white hover:border-sun-400"
        }`}
      >
        {active ? <BookmarkCheck className="h-4 w-4 text-sun-300" /> : <Bookmark className="h-4 w-4 text-sun-400" />}
        <span className="hidden max-w-[9rem] truncate md:inline">{active ? active.name : tr("Meine Suchen")}</span>
        <span className="sr-only md:hidden">{tr("Meine Suchen")}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={tr("Meine Suchen")}
          data-testid="presets-menu"
          className="absolute left-0 right-0 top-full z-[1100] mt-1 rounded-2xl border border-ink-100 bg-white p-3 text-ink-900 shadow-lift sm:left-auto sm:w-[24rem]"
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold">{tr("Meine Suchen")}</h3>
            <span className="text-[11px] text-ink-400">{tr("nur auf diesem Gerät")}</span>
          </div>

          {presets.length === 0 ? (
            <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-[12.5px] leading-snug text-ink-600">
              {tr("Speichere Startort, Umkreis und Wunschwetter als Vorlage – dann wählst du beim nächsten Mal nur noch den Zeitraum.")}
            </p>
          ) : (
            <ul className="thin-scroll -mx-1 max-h-64 overflow-y-auto">
              {presets.map((p) => {
                const isActive = active?.id === p.id;
                return (
                  <li key={p.id} data-testid="preset-item" className="flex items-center gap-1 rounded-xl px-1 hover:bg-sun-50">
                    {confirmId === p.id ? (
                      <div className="flex min-h-11 flex-1 items-center justify-between gap-2 pl-2 text-sm">
                        <span className="truncate">{tr("„{name}“ löschen?", { name: p.name })}</span>
                        <span className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onRemove(p.id);
                              setConfirmId(null);
                            }}
                            className="min-h-9 rounded-lg bg-rose-500 px-3 text-xs font-semibold text-white hover:bg-rose-600"
                          >
                            {tr("Löschen")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="min-h-9 rounded-lg bg-ink-100 px-3 text-xs font-semibold text-ink-700 hover:bg-ink-200"
                          >
                            {tr("Abbrechen")}
                          </button>
                        </span>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onApply(p);
                            setOpen(false);
                          }}
                          aria-label={tr("Suche „{name}“ laden", { name: p.name })}
                          className="min-h-11 min-w-0 flex-1 py-1.5 pl-2 text-left"
                        >
                          <span className="flex items-center gap-1.5 text-sm font-semibold">
                            <span className="truncate">{p.name}</span>
                            {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label={tr("aktiv")} />}
                          </span>
                          <span className="block truncate text-[11.5px] text-ink-500">{presetSummary(p)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleDefault(p.id)}
                          aria-pressed={p.isDefault}
                          aria-label={tr("„{name}“ beim Start laden", { name: p.name })}
                          title={p.isDefault ? tr("Wird beim Start geladen") : tr("Beim Start laden")}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-300 hover:bg-white hover:text-sun-500"
                        >
                          <Star className={`h-4 w-4 ${p.isDefault ? "fill-sun-400 text-sun-500" : ""}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(p.id)}
                          aria-label={tr("„{name}“ löschen", { name: p.name })}
                          title={tr("Löschen")}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-300 hover:bg-white hover:text-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="mt-3 border-t border-ink-100 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="mb-1 block text-[12px] font-semibold text-ink-600" htmlFor="sunify-preset-name">
              {tr("Aktuelle Suche speichern")}
            </label>
            <div className="flex gap-2">
              <input
                id="sunify-preset-name"
                value={name}
                maxLength={PRESET_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr("z. B. Wochenende am Berg")}
                disabled={!canSave}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-ink-200 px-3 text-[15px] outline-none focus:border-sun-400 disabled:bg-ink-50"
              />
              <button
                type="submit"
                disabled={!canSave || !name.trim() || full}
                className="min-h-11 shrink-0 rounded-xl bg-sun-500 px-4 text-sm font-semibold text-white transition hover:bg-sun-600 disabled:cursor-not-allowed disabled:bg-ink-200"
              >
                {exists ? tr("Überschreiben") : tr("Speichern")}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-ink-400">
              {!canSave
                ? tr("Wähle zuerst einen Startort.")
                : full
                  ? tr("Höchstens {n} Suchen – lösche zuerst eine.", { n: MAX_PRESETS })
                  : tr("Gespeichert werden Startort, Umkreis und alle Filter, nicht der Zeitraum. ★ = beim Öffnen der App laden.")}
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
