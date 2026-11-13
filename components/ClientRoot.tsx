"use client";

// Die App wird bewusst nur im Browser gerendert (ssr: false):
// Leaflet benötigt `window`, und Filter, Favoriten, Sprache und Einheiten kommen aus URL bzw. LocalStorage.

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { I18nProvider } from "@/lib/i18n-react";
import UpdateNotice from "./UpdateNotice";

function Loading() {
  const en = typeof navigator !== "undefined" && !navigator.language.toLowerCase().startsWith("de");
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-ink-900 text-white">
      <div className="text-5xl motion-safe:animate-pulse">☀️</div>
      <p className="text-sm text-ink-300">{en ? "Sunify is looking for the sun …" : "Sunify sucht die Sonne …"}</p>
    </div>
  );
}

const SunifyApp = dynamic(() => import("./SunifyApp"), { ssr: false, loading: Loading });

export default function ClientRoot() {
  // Service Worker für die installierbare App (PWA); nur in der veröffentlichten Version
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => reg.update())
      .catch(() => undefined);
  }, []);

  return (
    <I18nProvider>
      <SunifyApp />
      <UpdateNotice />
    </I18nProvider>
  );
}
