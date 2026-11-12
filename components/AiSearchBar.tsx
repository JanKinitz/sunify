"use client";

// Freitext-Leiste (Top-Bar) mit lokalem Regel-Parser (Deutsch/Englisch).

import { useMemo, useState } from "react";
import { ArrowRight, LoaderCircle, Sparkles, X } from "lucide-react";
import { examplePrompts, parsePrompt } from "@/lib/aiParse";
import { tr } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";
import type { Filters } from "@/lib/types";

interface AiSearchBarProps {
  onApply: (patch: Partial<Filters>) => void;
}

export default function AiSearchBar({ onApply }: AiSearchBarProps) {
  const { locale, units } = useI18n();
  const examples = useMemo(() => examplePrompts(), [locale, units]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recognized, setRecognized] = useState<string[] | null>(null);

  const run = (prompt: string) => {
    const value = prompt.trim();
    if (!value || busy) return;
    setText(value);
    setBusy(true);
    setRecognized(null);
    // Simulierte "Denkpause" der KI
    window.setTimeout(() => {
      const parsed = parsePrompt(value);
      if (parsed.recognized.length > 0) onApply(parsed.patch);
      setRecognized(parsed.recognized);
      setBusy(false);
    }, 650);
  };

  return (
    <div className="min-w-0 flex-1">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(text);
        }}
        className="group relative flex items-center rounded-2xl bg-white/10 ring-1 ring-white/15 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-sun-400"
      >
        <Sparkles className="pointer-events-none absolute left-3.5 h-[18px] w-[18px] text-sun-300 group-focus-within:text-sun-500" />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={tr("Wunsch-Wochenende beschreiben")}
          placeholder={tr("Beschreibe dein Wunsch-Wochenende (z. B. ‚Sa & So trocken, wenig Wind, max. 200 km zum Wandern‘) …")}
          className="w-full bg-transparent py-2.5 pl-11 pr-20 text-sm text-white placeholder:text-ink-300 outline-none group-focus-within:text-ink-900 group-focus-within:placeholder:text-ink-400"
        />
        {text && !busy && (
          <button
            type="button"
            onClick={() => {
              setText("");
              setRecognized(null);
            }}
            aria-label={tr("Eingabe löschen")}
            className="absolute right-12 rounded-full p-1 text-ink-300 hover:text-ink-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label={tr("Suche starten")}
          className="absolute right-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-sun-500 text-white transition hover:bg-sun-600 disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <div className="no-scrollbar mt-2 flex items-center gap-2 overflow-x-auto">
        {recognized === null ? (
          examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => run(ex.prompt)}
              title={ex.prompt}
              className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-ink-100 ring-1 ring-white/10 transition hover:bg-sun-500 hover:text-white"
            >
              {ex.label}
            </button>
          ))
        ) : (
          <div className="flex shrink-0 animate-fade-in items-center gap-2 text-xs text-ink-200">
            {recognized.length > 0 ? (
              <>
                <span className="flex items-center gap-1 font-semibold text-sun-300">
                  <Sparkles className="h-3.5 w-3.5" /> {tr("Filter gesetzt:")}
                </span>
                {recognized.map((r) => (
                  <span key={r} className="rounded-full bg-white/15 px-2.5 py-1 font-medium text-white">
                    {r}
                  </span>
                ))}
              </>
            ) : (
              <span>
                {tr("Das habe ich nicht verstanden – versuche z. B. „Sa & So trocken, mind. 10 °C, max. 200 km“.")}
              </span>
            )}
            <button
              type="button"
              onClick={() => setRecognized(null)}
              className="rounded-full px-2 py-1 text-ink-300 underline-offset-2 hover:text-white hover:underline"
            >
              {tr("Beispiele zeigen")}
            </button>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-300">
              {tr("Beta")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
