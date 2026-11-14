"use client";

// Einführung beim ersten Besuch: Willkommen (wozu Sunify da ist) und danach Schritt für Schritt
// Hinweise mit Pfeil auf Startort, Umkreis, Wunschwetter, Ergebnisse und „Meine Suchen“.
// Der Rest der Seite ist abgedunkelt, das gezeigte Element wird ausgespart.
// Gesehen-Merker im Browser (`sunify:tour`); über „?“ in der Top-Bar jederzeit erneut.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { tr } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";

export const TOUR_KEY = "sunify:tour";

export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_KEY) === "done";
  } catch {
    return true; // ohne Speicher lieber nicht bei jedem Aufruf zeigen
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_KEY, "done");
  } catch {
    /* egal */
  }
}

interface Step {
  /** Ziel-Elemente; das erste sichtbare wird hervorgehoben (Desktop/Handy unterscheiden sich) */
  targets: string[];
  title: string;
  body: string;
  /** abweichender Text, wenn das Ziel das Handy-Element ist (zweiter Eintrag in targets) */
  bodyMobile?: string;
}

const STEPS: Step[] = [
  {
    targets: ['[data-tour="origin"]'],
    title: "1. Startort wählen",
    body: "Tippe einen Ort ein oder nutze 📍 für deinen aktuellen Standort. Von hier aus sucht Sunify.",
  },
  {
    targets: ['[data-tour="radius"]'],
    title: "2. Umkreis festlegen",
    body: "Wie weit darf es höchstens sein? Gemessen wird in Luftlinie vom Startort.",
  },
  {
    targets: ['[data-testid="filters-desktop"]', '[data-testid="open-filters"]'],
    title: "3. Wunschwetter einstellen",
    body: "Zeitraum, Mindesttemperatur, Regen, Sonne und Wind. Profile wie „Wandern“ oder „Strand“ setzen passende Werte mit einem Klick.",
    bodyMobile:
      "Unter „Filter“ stellst du Zeitraum, Mindesttemperatur, Regen, Sonne und Wind ein. Profile wie „Wandern“ oder „Strand“ setzen passende Werte mit einem Klick.",
  },
  {
    targets: ['[data-testid="results-desktop"]', '[data-testid="show-list"]'],
    title: "4. Ergebnisse ansehen",
    body: "Karte und Liste zeigen, wo dein Wunschwetter herrscht. Gelb gestrichelt heißt knapp daneben, graue Punkte passen nicht.",
  },
  {
    targets: ['[data-tour="presets"]'],
    title: "Tipp: Meine Suchen",
    body: "Speichere Startort, Umkreis und Filter als Vorlage – beim nächsten Mal wählst du nur noch den Zeitraum.",
  },
];

const PAD = 6;
const GAP = 14;
const CARD_W = 340;

function visible(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function findTarget(step: Step): { el: HTMLElement; index: number } | null {
  for (let i = 0; i < step.targets.length; i++) {
    const el = document.querySelector(step.targets[i]);
    if (visible(el)) return { el, index: i };
  }
  return null;
}

type Rect = { top: number; left: number; width: number; height: number };

export default function OnboardingTour({ onClose }: { onClose: () => void }) {
  useI18n();
  // 0 = Willkommen, danach 1 … STEPS.length
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mobileTarget, setMobileTarget] = useState(false);
  const [view, setView] = useState({ w: 0, h: 0 });
  const nextRef = useRef<HTMLButtonElement>(null);
  const current = step > 0 ? STEPS[step - 1] : null;
  const last = step === STEPS.length;

  const measure = useCallback(() => {
    setView({ w: window.innerWidth, h: window.innerHeight });
    if (!current) {
      setRect(null);
      return;
    }
    const found = findTarget(current);
    if (!found) {
      setRect(null);
      return;
    }
    const r = found.el.getBoundingClientRect();
    // sehr hohe Bereiche (Filter-Spalte, Liste) nur im sichtbaren Teil markieren
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, window.innerHeight);
    setRect({ top, left: r.left, width: r.width, height: Math.max(0, bottom - top) });
    setMobileTarget(found.index > 0);
  }, [current]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const timer = window.setInterval(measure, 400); // Layout ändert sich z. B. beim Laden der Liste
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const next = useCallback(() => (last ? onClose() : setStep((s) => s + 1)), [last, onClose]);
  const back = () => setStep((s) => Math.max(1, s - 1));

  useEffect(() => {
    nextRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft" && step > 1) back();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [next, onClose, step]);

  // Position der Sprechblase: unter dem Ziel, sonst darüber; bei sehr großen Zielen in deren Mitte
  const cardW = Math.min(CARD_W, view.w - 24);
  let cardStyle: CSSProperties = {};
  let arrow: { left: number; side: "top" | "bottom" } | null = null;
  if (rect) {
    const spaceBelow = view.h - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const center = rect.left + rect.width / 2;
    const left = Math.min(Math.max(center - cardW / 2, 12), view.w - cardW - 12);
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
      const top = rect.top + rect.height + PAD + GAP;
      if (top + 160 < view.h) {
        cardStyle = { top, left, width: cardW };
        arrow = { left: center - left, side: "top" };
      }
    } else {
      cardStyle = { bottom: view.h - rect.top + PAD + GAP, left, width: cardW };
      arrow = { left: center - left, side: "bottom" };
    }
    if (!arrow) {
      // Ziel füllt fast den Bildschirm: Blase rechts daneben oder mittig darin
      const right = rect.left + rect.width + GAP;
      cardStyle =
        right + cardW + 12 < view.w
          ? { top: Math.max(rect.top + 40, 12), left: right }
          : { top: Math.max(rect.top + 40, 12), left: Math.max(12, center - cardW / 2) };
      cardStyle.width = cardW;
    }
  }
  const arrowLeft = arrow ? Math.min(Math.max(arrow.left, 20), cardW - 20) : 0;

  const title = current ? tr(current.title) : tr("Willkommen bei Sunify");
  const body = current
    ? tr(mobileTarget && current.bodyMobile ? current.bodyMobile : current.body)
    : null;

  return (
    <div className="fixed inset-0 z-[3000]" data-testid="tour">
      {/* Klicks auf die Seite während der Einführung abfangen */}
      <div className={`absolute inset-0 ${rect ? "" : "bg-ink-900/60"}`} onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div
          aria-hidden
          data-testid="tour-spotlight"
          className="pointer-events-none absolute rounded-xl ring-2 ring-sun-400 transition-all duration-300"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(10, 15, 30, 0.6)",
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="tour-card"
        className={`absolute rounded-2xl bg-white p-4 text-ink-900 shadow-lift ${
          rect ? "" : "left-1/2 top-1/2 w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 p-5"
        }`}
        style={rect ? cardStyle : undefined}
      >
        {arrow && (
          <span
            aria-hidden
            className="absolute h-3.5 w-3.5 rotate-45 bg-white"
            style={{
              left: arrowLeft - 7,
              ...(arrow.side === "top" ? { top: -7 } : { bottom: -7 }),
            }}
          />
        )}

        {current ? (
          <>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sun-600">
              {tr("Schritt {n} von {total}", { n: step, total: STEPS.length })}
            </div>
            <h2 className="text-base font-bold">{title}</h2>
            <p className="mt-1.5 text-[13.5px] leading-snug text-ink-600">{body}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={onClose} className="min-h-10 px-1 text-sm text-ink-400 hover:text-ink-700">
                {tr("Überspringen")}
              </button>
              <div className="flex gap-2">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={back}
                    className="min-h-10 rounded-xl bg-ink-100 px-3 text-sm font-semibold text-ink-700 hover:bg-ink-200"
                  >
                    {tr("Zurück")}
                  </button>
                )}
                <button
                  ref={nextRef}
                  type="button"
                  onClick={next}
                  className="min-h-10 rounded-xl bg-sun-500 px-4 text-sm font-semibold text-white hover:bg-sun-600"
                >
                  {last ? tr("Los geht's") : tr("Weiter")}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 text-3xl" aria-hidden>
              ☀️
            </div>
            <h2 className="text-lg font-extrabold">{title}</h2>
            <p className="mt-2 text-[14px] leading-snug text-ink-600">
              {tr(
                "Sunify dreht die Wettersuche um: Du sagst, welches Wetter du dir wünschst – Sunify zeigt dir, wo es im Umkreis herrscht. Ideal für Ausflüge, Wochenenden und Kurzurlaube."
              )}
            </p>
            <p className="mt-2 text-[13px] leading-snug text-ink-500">
              {tr("Die Vorhersage reicht 16 Tage weit und wird mehrmals täglich aktualisiert.")}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                ref={nextRef}
                type="button"
                onClick={next}
                className="min-h-11 flex-1 rounded-xl bg-sun-500 px-4 text-sm font-semibold text-white hover:bg-sun-600"
              >
                {tr("Kurz zeigen, wie es geht")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-xl px-4 text-sm font-semibold text-ink-500 hover:bg-ink-50 hover:text-ink-800"
              >
                {tr("Überspringen")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
