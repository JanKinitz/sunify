"use client";

// Erkennt eine neue Veröffentlichung und lädt die App neu:
// - Ist die Seite gerade im Hintergrund (anderer Tab, Handy gesperrt), wird beim Zurückkehren
//   still neu geladen – dabei geht nichts verloren, Filter stehen in der Adresse, Merkliste im Speicher.
// - Ist die Seite sichtbar, erscheint ein Hinweis mit "Aktualisieren", damit niemand mitten
//   in der Bedienung unterbrochen wird.
// Geprüft wird beim Zurückkehren zur Seite und alle 5 Minuten über /api/version.

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { tr } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";

const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const INTERVAL_MS = 5 * 60 * 1000;

async function latestBuild(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: unknown };
    return typeof data.build === "string" ? data.build : null;
  } catch {
    return null;
  }
}

export default function UpdateNotice() {
  useI18n();
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const availableRef = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || CURRENT === "dev") return;
    let stopped = false;

    const check = async () => {
      const build = await latestBuild();
      if (stopped || !build || build === CURRENT) return;
      availableRef.current = true;
      if (document.visibilityState === "hidden") window.location.reload();
      else setAvailable(true);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // Zurück auf der Seite: bekanntes Update sofort laden, sonst nachsehen
      if (availableRef.current) window.location.reload();
      else void check();
    };

    const timer = window.setInterval(() => void check(), INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!available || dismissed) return null;
  return (
    <div
      data-testid="update-banner"
      role="alert"
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] mx-auto flex max-w-md animate-fade-in items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-white shadow-lift ring-1 ring-white/10"
    >
      <RefreshCw className="h-5 w-5 shrink-0 text-sun-400" />
      <span className="flex-1">{tr("Eine neue Version von Sunify ist da.")}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg bg-sun-500 px-3 py-1.5 font-semibold transition hover:bg-sun-600"
      >
        {tr("Aktualisieren")}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={tr("Später")}
        title={tr("Später")}
        className="shrink-0 rounded-lg p-1 text-ink-300 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
