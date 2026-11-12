// Affiliate-Link-Generator gemäß Kapitel 8 der Spezifikation.
// Reine URL-Konstruktion (kein API-Call) – daher bereits in Phase 0 mit echter Logik aktiv.

import { addDays, diffDays } from "@/lib/dates";
import { getLocale } from "@/lib/i18n";

export interface AffiliateLinkParams {
  cityName: string;
  countryCode: string;
  lat: number;
  lon: number;
  startDate: string; // Format: YYYY-MM-DD
  endDate: string; // Format: YYYY-MM-DD
  adults?: number;
}

/** Platzhalter, bis eine echte Partner-ID (Booking.com / Travelpayouts / Awin) vorliegt. */
export const DEMO_AFFILIATE_ID =
  process.env.NEXT_PUBLIC_BOOKING_AFFILIATE_ID ?? "SUNIFY_DEMO";

/** Check-in/Check-out: bei identischem Start- und Enddatum wird Check-out = Start + 1 Tag. */
export function getStayDates(startDate: string, endDate: string) {
  const checkin = startDate;
  const checkout = startDate === endDate ? addDays(startDate, 1) : endDate;
  return { checkin, checkout, nights: Math.max(1, diffDays(checkin, checkout)) };
}

export function generateAccommodationLink(
  params: AffiliateLinkParams,
  affiliateId: string = DEMO_AFFILIATE_ID
): string {
  const { checkin, checkout } = getStayDates(params.startDate, params.endDate);
  const adults = params.adults || 2;

  // Ziel-URL mit vorausgefülltem Ort, Koordinaten und Zeitraum
  // Sprache der Booking-Seite folgt der App-Sprache
  const baseUrl = `https://www.booking.com/searchresults.${getLocale() === "en" ? "en-gb" : "de"}.html`;
  const queryParams = new URLSearchParams({
    ss: `${params.cityName}`,
    checkin,
    checkout,
    group_adults: adults.toString(),
    no_rooms: "1",
    latitude: params.lat.toString(),
    longitude: params.lon.toString(),
    aid: affiliateId, // Partner-ID (oder Wrapper-URL von Travelpayouts/Awin)
  });

  return `${baseUrl}?${queryParams.toString()}`;
}

/** Sekundärer CTA: Camping- & Wohnmobilstellplätze in der Nähe (Google-Maps-Suche). */
export function generateCampingLink(cityName: string): string {
  const q = new URLSearchParams({
    api: "1",
    query: getLocale() === "en" ? `campsite motorhome parking ${cityName}` : `Campingplatz Wohnmobilstellplatz ${cityName}`,
  });
  return `https://www.google.com/maps/search/?${q.toString()}`;
}

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
