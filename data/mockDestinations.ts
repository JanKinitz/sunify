// Lokale Mock-Datenbank für Phase 0 (Click-Dummy) – KEIN Backend, KEINE externe Wetter-API.
// 25 reale Ausflugsorte in der DACH-Region mit plausiblen, deterministisch erzeugten
// 14-Tage-Wetterprofilen. Die Prognosen werden relativ zum heutigen Datum berechnet,
// damit "Dieses Wochenende" & Co. jederzeit funktionieren. In Phase 3 wird dieses Modul
// durch den echten Endpunkt POST /api/search ersetzt.

import type { DailyForecast, Destination, Origin, TagKey } from "@/lib/types";
import { FORECAST_DAYS, addDays, parseISO, todayISO } from "@/lib/dates";

type Zone = "west" | "central" | "south" | "southeast" | "east" | "alpsSouth";

interface Seed {
  id: number;
  name: string;
  countryCode: "DE" | "AT" | "CH";
  adminRegion: string;
  area: string;
  lat: number;
  lon: number;
  population: number;
  tourismScore: number;
  tags: TagKey[];
  hashtags: string[];
  teaser: string;
  emoji: string;
  // Klima-Parameter für den Wetter-Generator
  zone: Zone;
  tempOffset: number; // Abweichung von der Monats-Normaltemperatur (Höhenlage, Gunstlage)
  wetBias: number; // > 0 = regenanfälliger (Staulagen), < 0 = trockener
  windBase: number; // Grundwind in km/h
}

const SEEDS: Seed[] = [
  { id: 1, name: "Cochem", countryCode: "DE", adminRegion: "Rheinland-Pfalz", area: "Mosel", lat: 50.1467, lon: 7.1667, population: 5300, tourismScore: 88, tags: ["wine", "historic", "hiking"], hashtags: ["Wein", "Burg", "Wandern"], teaser: "Reichsburg, Steillagen-Riesling und Moselschleifen.", emoji: "🍇", zone: "west", tempOffset: 1, wetBias: 0, windBase: 8 },
  { id: 2, name: "Tegernsee", countryCode: "DE", adminRegion: "Bayern", area: "Oberbayern", lat: 47.7123, lon: 11.758, population: 3700, tourismScore: 92, tags: ["lake", "mountains", "wellness", "hiking"], hashtags: ["See", "Berge", "Wellness"], teaser: "Bergsee-Idylle mit Bräustüberl und Wallberg-Panorama.", emoji: "⛵", zone: "south", tempOffset: -1.5, wetBias: 0.03, windBase: 7 },
  { id: 3, name: "Winterberg", countryCode: "DE", adminRegion: "Nordrhein-Westfalen", area: "Sauerland", lat: 51.195, lon: 8.5347, population: 12600, tourismScore: 78, tags: ["mountains", "hiking"], hashtags: ["Wandern", "Bike", "Natur"], teaser: "Rothaarsteig, Bikepark und weite Höhenzüge.", emoji: "🌲", zone: "west", tempOffset: -4, wetBias: 0.08, windBase: 14 },
  { id: 4, name: "Freiburg im Breisgau", countryCode: "DE", adminRegion: "Baden-Württemberg", area: "Breisgau", lat: 47.999, lon: 7.8421, population: 236000, tourismScore: 86, tags: ["historic", "wine", "culture"], hashtags: ["Altstadt", "Wein", "Kultur"], teaser: "Münster, Bächle und die sonnigste Ecke Deutschlands.", emoji: "🌞", zone: "west", tempOffset: 2.5, wetBias: -0.05, windBase: 6 },
  { id: 5, name: "Titisee-Neustadt", countryCode: "DE", adminRegion: "Baden-Württemberg", area: "Schwarzwald", lat: 47.902, lon: 8.2147, population: 12300, tourismScore: 84, tags: ["lake", "hiking", "mountains", "wellness"], hashtags: ["See", "Wandern", "Wellness"], teaser: "Hochschwarzwald-See mit Uferpromenade und Feldbergblick.", emoji: "🏞️", zone: "west", tempOffset: -3, wetBias: 0.05, windBase: 9 },
  { id: 6, name: "Baden-Baden", countryCode: "DE", adminRegion: "Baden-Württemberg", area: "Nordschwarzwald", lat: 48.7606, lon: 8.2398, population: 57000, tourismScore: 85, tags: ["wellness", "culture", "historic"], hashtags: ["Wellness", "Kultur", "Thermen"], teaser: "Thermen, Kurhaus und Lichtentaler Allee.", emoji: "♨️", zone: "west", tempOffset: 1.5, wetBias: 0, windBase: 6 },
  { id: 7, name: "Heidelberg", countryCode: "DE", adminRegion: "Baden-Württemberg", area: "Neckartal", lat: 49.3988, lon: 8.6724, population: 162000, tourismScore: 90, tags: ["historic", "culture"], hashtags: ["Schloss", "Altstadt", "Kultur"], teaser: "Schlossruine, Alte Brücke und Philosophenweg.", emoji: "🏰", zone: "west", tempOffset: 2, wetBias: -0.03, windBase: 7 },
  { id: 8, name: "Rothenburg ob der Tauber", countryCode: "DE", adminRegion: "Bayern", area: "Romantische Straße", lat: 49.3802, lon: 10.1867, population: 11400, tourismScore: 89, tags: ["historic", "culture"], hashtags: ["Mittelalter", "Altstadt", "Kultur"], teaser: "Fachwerk, Stadtmauer und das Plönlein.", emoji: "🏘️", zone: "central", tempOffset: 0, wetBias: -0.02, windBase: 9 },
  { id: 9, name: "Lindau (Bodensee)", countryCode: "DE", adminRegion: "Bayern", area: "Bodensee", lat: 47.546, lon: 9.6843, population: 25800, tourismScore: 87, tags: ["lake", "historic"], hashtags: ["See", "Insel", "Altstadt"], teaser: "Inselstadt mit Hafen, Löwe und Alpenblick.", emoji: "🦁", zone: "south", tempOffset: 0.5, wetBias: 0, windBase: 8 },
  { id: 10, name: "Meersburg", countryCode: "DE", adminRegion: "Baden-Württemberg", area: "Bodensee", lat: 47.6942, lon: 9.2706, population: 6100, tourismScore: 86, tags: ["lake", "wine", "historic"], hashtags: ["See", "Wein", "Burg"], teaser: "Burg über dem See und Rebhänge bis ans Ufer.", emoji: "🍷", zone: "south", tempOffset: 1, wetBias: -0.02, windBase: 8 },
  { id: 11, name: "Garmisch-Partenkirchen", countryCode: "DE", adminRegion: "Bayern", area: "Zugspitzregion", lat: 47.4917, lon: 11.0955, population: 27500, tourismScore: 91, tags: ["mountains", "hiking", "wellness"], hashtags: ["Berge", "Wandern", "Zugspitze"], teaser: "Zugspitze, Partnachklamm und Eibsee.", emoji: "🏔️", zone: "south", tempOffset: -2, wetBias: 0.04, windBase: 6 },
  { id: 12, name: "Füssen", countryCode: "DE", adminRegion: "Bayern", area: "Allgäu", lat: 47.5696, lon: 10.7004, population: 15600, tourismScore: 90, tags: ["historic", "mountains", "lake", "hiking"], hashtags: ["Schlösser", "Berge", "See"], teaser: "Neuschwanstein, Forggensee und Lechfall.", emoji: "👑", zone: "south", tempOffset: -2, wetBias: 0.03, windBase: 7 },
  { id: 13, name: "Berchtesgaden", countryCode: "DE", adminRegion: "Bayern", area: "Berchtesgadener Land", lat: 47.6303, lon: 13.0019, population: 7800, tourismScore: 93, tags: ["mountains", "lake", "hiking"], hashtags: ["Berge", "Königssee", "Wandern"], teaser: "Königssee, Watzmann und Nationalpark.", emoji: "⛰️", zone: "southeast", tempOffset: -2, wetBias: 0.05, windBase: 6 },
  { id: 14, name: "Bamberg", countryCode: "DE", adminRegion: "Bayern", area: "Oberfranken", lat: 49.8988, lon: 10.9028, population: 78000, tourismScore: 87, tags: ["historic", "culture"], hashtags: ["Welterbe", "Bier", "Altstadt"], teaser: "Welterbe-Altstadt, Klein-Venedig und Rauchbier.", emoji: "🍺", zone: "central", tempOffset: 0.5, wetBias: -0.03, windBase: 8 },
  { id: 15, name: "Würzburg", countryCode: "DE", adminRegion: "Bayern", area: "Mainfranken", lat: 49.7913, lon: 9.9534, population: 128000, tourismScore: 84, tags: ["wine", "historic", "culture"], hashtags: ["Wein", "Residenz", "Kultur"], teaser: "Residenz, Alte Mainbrücke und Silvaner.", emoji: "🥂", zone: "central", tempOffset: 1.5, wetBias: -0.05, windBase: 8 },
  { id: 16, name: "Rüdesheim am Rhein", countryCode: "DE", adminRegion: "Hessen", area: "Rheingau", lat: 49.979, lon: 7.9234, population: 10000, tourismScore: 85, tags: ["wine", "historic", "hiking"], hashtags: ["Wein", "Rhein", "Wandern"], teaser: "Drosselgasse, Niederwalddenkmal und Riesling.", emoji: "🍾", zone: "west", tempOffset: 2, wetBias: -0.04, windBase: 8 },
  { id: 17, name: "Oberstdorf", countryCode: "DE", adminRegion: "Bayern", area: "Allgäuer Alpen", lat: 47.4099, lon: 10.2797, population: 9700, tourismScore: 89, tags: ["mountains", "hiking", "wellness"], hashtags: ["Berge", "Wandern", "Natur"], teaser: "Nebelhorn, Breitachklamm und Bergwiesen.", emoji: "🥾", zone: "south", tempOffset: -3, wetBias: 0.05, windBase: 7 },
  { id: 18, name: "Luzern", countryCode: "CH", adminRegion: "Kanton Luzern", area: "Vierwaldstättersee", lat: 47.0502, lon: 8.3093, population: 83000, tourismScore: 92, tags: ["lake", "historic", "mountains", "culture"], hashtags: ["See", "Altstadt", "Pilatus"], teaser: "Kapellbrücke, Pilatus und Dampfschiffe.", emoji: "🚢", zone: "south", tempOffset: 0.5, wetBias: 0.02, windBase: 6 },
  { id: 19, name: "Lugano", countryCode: "CH", adminRegion: "Kanton Tessin", area: "Tessin", lat: 46.0037, lon: 8.9511, population: 63000, tourismScore: 90, tags: ["lake", "culture", "hiking"], hashtags: ["See", "Dolcevita", "Palmen"], teaser: "Palmen, Piazza und mediterranes Flair am See.", emoji: "🌴", zone: "alpsSouth", tempOffset: 5, wetBias: -0.05, windBase: 5 },
  { id: 20, name: "Salzburg", countryCode: "AT", adminRegion: "Salzburg", area: "Salzburger Land", lat: 47.8095, lon: 13.055, population: 157000, tourismScore: 93, tags: ["historic", "culture"], hashtags: ["Mozart", "Altstadt", "Kultur"], teaser: "Festung, Getreidegasse und Mozartkugeln.", emoji: "🎻", zone: "southeast", tempOffset: 0, wetBias: 0.04, windBase: 7 },
  { id: 21, name: "Innsbruck", countryCode: "AT", adminRegion: "Tirol", area: "Inntal", lat: 47.2692, lon: 11.4041, population: 131000, tourismScore: 88, tags: ["mountains", "historic", "culture", "hiking"], hashtags: ["Berge", "Altstadt", "Nordkette"], teaser: "Goldenes Dachl und in 20 Minuten auf 2.000 m.", emoji: "🚡", zone: "southeast", tempOffset: 1, wetBias: -0.03, windBase: 9 },
  { id: 22, name: "Trier", countryCode: "DE", adminRegion: "Rheinland-Pfalz", area: "Mosel", lat: 49.7499, lon: 6.6371, population: 111000, tourismScore: 82, tags: ["historic", "wine", "culture"], hashtags: ["Römer", "Wein", "Kultur"], teaser: "Porta Nigra, Kaiserthermen und Moselwein.", emoji: "🏛️", zone: "west", tempOffset: 1.5, wetBias: 0, windBase: 8 },
  { id: 23, name: "Hallstatt", countryCode: "AT", adminRegion: "Oberösterreich", area: "Salzkammergut", lat: 47.5622, lon: 13.6493, population: 750, tourismScore: 94, tags: ["lake", "historic", "mountains"], hashtags: ["See", "Welterbe", "Berge"], teaser: "Postkarten-Dorf zwischen See und Dachstein.", emoji: "🛶", zone: "southeast", tempOffset: -1.5, wetBias: 0.06, windBase: 5 },
  { id: 24, name: "Quedlinburg", countryCode: "DE", adminRegion: "Sachsen-Anhalt", area: "Harz", lat: 51.789, lon: 11.1414, population: 23500, tourismScore: 83, tags: ["historic", "culture", "hiking"], hashtags: ["Fachwerk", "Welterbe", "Harz"], teaser: "Über 2.000 Fachwerkhäuser am Rand des Harzes.", emoji: "🧙", zone: "east", tempOffset: 0, wetBias: -0.06, windBase: 11 },
  { id: 25, name: "Bad Schandau", countryCode: "DE", adminRegion: "Sachsen", area: "Sächsische Schweiz", lat: 50.9177, lon: 14.1547, population: 3600, tourismScore: 86, tags: ["mountains", "hiking", "wellness"], hashtags: ["Wandern", "Felsen", "Elbe"], teaser: "Sandsteinfelsen, Malerweg und Elbtal.", emoji: "🧗", zone: "east", tempOffset: 0, wetBias: -0.02, windBase: 8 },
];

// ---------------------------------------------------------------------------
// Wetter-Generator (deterministisch, saisonabhängig)
// ---------------------------------------------------------------------------

/** Mittlere Tageshöchsttemperatur im DACH-Flachland je Monat (Jan–Dez). */
const MONTH_TEMP = [3, 5, 10, 15, 19, 22, 25, 24, 20, 14, 8, 4];
/** Maximal mögliche Sonnenstunden je Monat (Jan–Dez). */
const MONTH_SUN = [6.5, 8, 10, 12, 13.5, 14.5, 14, 13, 11, 9, 7, 6];

const ZONE_PHASE: Record<Zone, number> = {
  west: 0,
  central: 0.08,
  south: 0.14,
  southeast: 0.2,
  east: 0.26,
  alpsSouth: 0.55, // Alpensüdseite: häufig gegenläufiges Wetter
};

function hash01(input: string): number {
  // FNV-1a, auf [0, 1) normiert
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Saisonale Normalwerte – auch für jahreszeitlich passende Filter-Voreinstellungen genutzt. */
export function seasonalNormals(iso: string = todayISO()) {
  const month = parseISO(iso).getMonth();
  return { tempMax: MONTH_TEMP[month], maxSun: MONTH_SUN[month] };
}

function forecastFor(seed: Seed, iso: string): DailyForecast {
  const { tempMax: baseTemp, maxSun } = seasonalNormals(iso);
  const dayNumber = Math.round(parseISO(iso).getTime() / 86400000);

  // Großwetterlage: Hoch- und Tiefdruckphasen im Wochenrhythmus, die von West nach Ost
  // durchziehen. Für den Click-Dummy liegt das Hoch bewusst meist am Wochenende, damit
  // die Standard-Suche Treffer zeigt; eine 14-Tage-Welle sorgt für Unterschiede zwischen
  // "diesem" und "nächstem" Wochenende.
  const weekly = Math.sin(2 * Math.PI * ((dayNumber - 4) / 7 - ZONE_PHASE[seed.zone] * 0.6));
  const biweekly = Math.sin(2 * Math.PI * (dayNumber / 14 + ZONE_PHASE[seed.zone]));
  const synoptic = 0.5 + 0.36 * weekly + 0.14 * biweekly;
  const local = hash01(`${seed.id}|${iso}|wet`);
  const wet = clamp(0.62 * synoptic + 0.38 * local + seed.wetBias, 0, 1);

  let precip = 0;
  let weatherCode: number;
  let sunFactor: number;
  if (wet < 0.3) {
    weatherCode = wet < 0.16 ? 0 : 1;
    sunFactor = 0.95 - wet * 0.6;
  } else if (wet < 0.48) {
    weatherCode = 2;
    sunFactor = 0.8 - wet * 0.7;
  } else if (wet < 0.6) {
    weatherCode = 3;
    sunFactor = 0.3 - (wet - 0.48) * 1.2;
    precip = hash01(`${seed.id}|${iso}|drizzle`) > 0.55 ? round1(0.2 + (wet - 0.48) * 6) : 0;
    if (precip > 0) weatherCode = 51;
  } else {
    precip = round1(1.2 + (wet - 0.6) * 38);
    weatherCode = precip > 8 ? 63 : precip > 3 ? 61 : 80;
    sunFactor = Math.max(0, 0.16 - (wet - 0.6) * 0.5);
  }

  const tempMax = round1(
    baseTemp + seed.tempOffset + (0.5 - wet) * 7 + (hash01(`${seed.id}|${iso}|t`) - 0.5) * 2.4
  );
  const tempMin = round1(tempMax - (4.5 + (1 - wet) * 5));
  const wind = Math.round(seed.windBase + wet * 17 + hash01(`${seed.id}|${iso}|w`) * 7);
  const gusts = Math.round(wind * (1.45 + hash01(`${seed.id}|${iso}|g`) * 0.4));
  const sunshine = round1(maxSun * clamp(sunFactor, 0, 1));
  const precipProb = Math.round(clamp(wet * 125 - 22, 2, 98));

  // Bei Frost fällt Niederschlag als Schnee
  if (precip > 0 && tempMax <= 1) weatherCode = 71;

  return { date: iso, tempMax, tempMin, precip, precipProb, wind, gusts, sunshine, weatherCode };
}

function buildDestinations(): Destination[] {
  const today = todayISO();
  return SEEDS.map((seed) => {
    const { zone: _zone, tempOffset: _t, wetBias: _w, windBase: _b, ...base } = seed;
    const forecasts: DailyForecast[] = [];
    for (let i = 0; i < FORECAST_DAYS; i++) forecasts.push(forecastFor(seed, addDays(today, i)));
    return { ...base, forecasts };
  });
}

export const mockDestinations: Destination[] = buildDestinations();

// ---------------------------------------------------------------------------
// Startorte für das Standort-Autocomplete (in Phase 3 durch Photon-Geocoding ersetzt)
// ---------------------------------------------------------------------------

export const mockOrigins: Origin[] = [
  { id: "stuttgart", name: "Stuttgart", lat: 48.7758, lon: 9.1829 },
  { id: "muenchen", name: "München", lat: 48.1372, lon: 11.5756 },
  { id: "frankfurt", name: "Frankfurt am Main", lat: 50.1109, lon: 8.6821 },
  { id: "koeln", name: "Köln", lat: 50.9375, lon: 6.9603 },
  { id: "nuernberg", name: "Nürnberg", lat: 49.4521, lon: 11.0767 },
  { id: "karlsruhe", name: "Karlsruhe", lat: 49.0069, lon: 8.4037 },
  { id: "mannheim", name: "Mannheim", lat: 49.4875, lon: 8.466 },
  { id: "ulm", name: "Ulm", lat: 48.4011, lon: 9.9876 },
  { id: "augsburg", name: "Augsburg", lat: 48.3705, lon: 10.8978 },
  { id: "duesseldorf", name: "Düsseldorf", lat: 51.2277, lon: 6.7735 },
  { id: "leipzig", name: "Leipzig", lat: 51.3397, lon: 12.3731 },
  { id: "dresden", name: "Dresden", lat: 51.0504, lon: 13.7373 },
  { id: "berlin", name: "Berlin", lat: 52.52, lon: 13.405 },
  { id: "hamburg", name: "Hamburg", lat: 53.5511, lon: 9.9937 },
  { id: "hannover", name: "Hannover", lat: 52.3759, lon: 9.732 },
  { id: "zuerich", name: "Zürich", lat: 47.3769, lon: 8.5417 },
  { id: "basel", name: "Basel", lat: 47.5596, lon: 7.5886 },
  { id: "bern", name: "Bern", lat: 46.948, lon: 7.4474 },
  { id: "wien", name: "Wien", lat: 48.2082, lon: 16.3738 },
  { id: "salzburg", name: "Salzburg", lat: 47.8095, lon: 13.055 },
  { id: "innsbruck", name: "Innsbruck", lat: 47.2692, lon: 11.4041 },
];

export const DEFAULT_ORIGIN: Origin = mockOrigins[0];
