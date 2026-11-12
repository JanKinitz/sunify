// Räumliches Wetter-Raster über die DACH-Region (Kapitel 3.2 und 6.1 der Spezifikation).

export interface GridPoint {
  lat: number;
  lon: number;
}

/** Bounding Box DACH */
export const DACH_BOUNDS = { latMin: 45.8, latMax: 55.1, lonMin: 5.8, lonMax: 17.2 };

/** 0,25° Breite ≈ 27 km, 0,35° Länge ≈ 25 km (auf 50° Nord) */
export const GRID_STEP = { lat: 0.25, lon: 0.35 };

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** Gleichmäßiges Koordinaten-Raster über die Bounding Box. */
export function generateGrid(bounds = DACH_BOUNDS, step = GRID_STEP): GridPoint[] {
  const rows = Math.floor((bounds.latMax - bounds.latMin) / step.lat + 1e-9) + 1;
  const cols = Math.floor((bounds.lonMax - bounds.lonMin) / step.lon + 1e-9) + 1;
  const points: GridPoint[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      points.push({
        lat: round4(bounds.latMin + r * step.lat),
        lon: round4(bounds.lonMin + c * step.lon),
      });
    }
  }
  return points;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
