// Import der Ortsdaten aus dem kostenlosen GeoNames-Datensatz cities1000
// (alle Orte mit mehr als 1.000 Einwohnern). Lizenz: CC BY 4.0, https://www.geonames.org

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const GEONAMES_URL = "https://download.geonames.org/export/dump/cities1000.zip";
const CACHE_DIR = path.join(process.cwd(), ".cache", "geonames");
const CACHE_FILE = path.join(CACHE_DIR, "cities1000.txt");

export interface Place {
  name: string;
  countryCode: string;
  adminRegion: string | null;
  lat: number;
  lon: number;
  population: number;
  elevation: number | null;
  featureCode: string;
}

// GeoNames-admin1-Codes → Bundesland / Kanton
const ADMIN1: Record<string, Record<string, string>> = {
  DE: {
    "01": "Baden-Württemberg", "02": "Bayern", "03": "Bremen", "04": "Hamburg", "05": "Hessen",
    "06": "Niedersachsen", "07": "Nordrhein-Westfalen", "08": "Rheinland-Pfalz", "09": "Saarland",
    "10": "Schleswig-Holstein", "11": "Brandenburg", "12": "Mecklenburg-Vorpommern", "13": "Sachsen",
    "14": "Sachsen-Anhalt", "15": "Thüringen", "16": "Berlin",
  },
  AT: {
    "01": "Burgenland", "02": "Kärnten", "03": "Niederösterreich", "04": "Oberösterreich",
    "05": "Salzburg", "06": "Steiermark", "07": "Tirol", "08": "Vorarlberg", "09": "Wien",
  },
  CH: {
    AG: "Aargau", AI: "Appenzell Innerrhoden", AR: "Appenzell Ausserrhoden", BE: "Bern",
    BL: "Basel-Landschaft", BS: "Basel-Stadt", FR: "Freiburg", GE: "Genf", GL: "Glarus",
    GR: "Graubünden", JU: "Jura", LU: "Luzern", NE: "Neuenburg", NW: "Nidwalden", OW: "Obwalden",
    SG: "St. Gallen", SH: "Schaffhausen", SO: "Solothurn", SZ: "Schwyz", TG: "Thurgau",
    TI: "Tessin", UR: "Uri", VD: "Waadt", VS: "Wallis", ZG: "Zug", ZH: "Zürich",
  },
};

/**
 * Liest die GeoNames-Tabelle (Tab-getrennt) und liefert alle bewohnten Orte der Zielländer.
 * Spalten: 0 id · 1 name · 4 lat · 5 lon · 6 feature class · 7 feature code · 8 country ·
 *          10 admin1 · 14 population · 15 elevation · 16 dem
 */
export function parseGeoNames(text: string, countries: string[] = ["DE", "AT", "CH"]): Place[] {
  const wanted = new Set(countries);
  const places: Place[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const col = line.split("\t");
    if (col.length < 17) continue;
    const countryCode = col[8];
    if (!wanted.has(countryCode) || col[6] !== "P") continue;
    const lat = Number(col[4]);
    const lon = Number(col[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Aufgegebene/historische Orte und Ortsteile überspringen
    if (col[7] === "PPLH" || col[7] === "PPLQ" || col[7] === "PPLW" || col[7] === "PPLX") continue;
    const elevationRaw = col[15] !== "" ? col[15] : col[16];
    const elevation = elevationRaw !== "" && Number.isFinite(Number(elevationRaw)) ? Number(elevationRaw) : null;
    places.push({
      name: col[1],
      countryCode,
      adminRegion: ADMIN1[countryCode]?.[col[10]] ?? null,
      lat,
      lon,
      population: Number(col[14]) || 0,
      elevation: elevation !== null && elevation > -100 ? Math.round(elevation) : null,
      featureCode: col[7],
    });
  }
  return places;
}

/**
 * Lädt cities1000.txt: aus GEONAMES_FILE (lokale Datei), aus dem Cache oder per Download.
 * Der Download wird unter .cache/geonames/ abgelegt und beim nächsten Lauf wiederverwendet.
 */
export async function loadGeoNamesText(): Promise<string> {
  const local = process.env.GEONAMES_FILE;
  if (local) {
    console.log(`   Quelle: lokale Datei ${local}`);
    return readFileSync(local, "utf8");
  }
  if (existsSync(CACHE_FILE)) {
    console.log("   Quelle: Cache (.cache/geonames/cities1000.txt)");
    return readFileSync(CACHE_FILE, "utf8");
  }
  console.log(`   Lade ${GEONAMES_URL} (ca. 9 MB) …`);
  const response = await fetch(GEONAMES_URL);
  if (!response.ok) {
    throw new Error(`GeoNames-Download fehlgeschlagen: HTTP ${response.status}`);
  }
  const zipped = new Uint8Array(await response.arrayBuffer());
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(zipped, { filter: (file) => file.name === "cities1000.txt" });
  const entry = files["cities1000.txt"];
  if (!entry) throw new Error("cities1000.txt nicht im GeoNames-Archiv gefunden.");
  const text = strFromU8(entry);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, text, "utf8");
  return text;
}
