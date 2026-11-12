"use client";

// Die App wird bewusst nur im Browser gerendert (ssr: false):
// Leaflet benötigt `window`, und Filter/Favoriten werden aus URL bzw. LocalStorage gelesen.

import dynamic from "next/dynamic";

const SunifyApp = dynamic(() => import("./SunifyApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-ink-900 text-white">
      <div className="text-5xl motion-safe:animate-pulse">☀️</div>
      <p className="text-sm text-ink-300">Sunify sucht die Sonne …</p>
    </div>
  ),
});

export default function ClientRoot() {
  return <SunifyApp />;
}
