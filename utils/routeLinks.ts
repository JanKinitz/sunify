// Routen-Links zu Kartendiensten (reine URL-Konstruktion, kein API-Call).
// Sunify enthält bewusst keine Buchungs- oder Partner-Links (nicht-kommerzielles Projekt).

import { getLocale } from "@/lib/i18n";

export function generateGoogleMapsRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): string {
  const q = new URLSearchParams({
    api: "1",
    origin: `${from.lat},${from.lon}`,
    destination: `${to.lat},${to.lon}`,
    travelmode: "driving",
    hl: getLocale(),
  });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

export function generateAppleMapsRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): string {
  const q = new URLSearchParams({
    saddr: `${from.lat},${from.lon}`,
    daddr: `${to.lat},${to.lon}`,
    dirflg: "d",
  });
  return `https://maps.apple.com/?${q.toString()}`;
}
