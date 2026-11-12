// Phase 1 · Seed-Skript für Wetter-Raster und Orte (Kapitel 6.1 / Kapitel 9, Phase 1).
//   1. generiert das Koordinaten-Raster für die DACH-Region,
//   2. importiert Orte (GeoNames cities1000 + kuratierte Tourismus-Ziele),
//   3. ordnet jeden Ort per PostGIS dem nächstgelegenen Rasterpunkt zu (grid_id)
//      und löscht Rasterpunkte ohne Orte, um später Wetter-API-Calls zu sparen.
// Aufruf: npm run db:seed   (setzt alle drei Tabellen neu auf – auch vorhandene Prognosen)

import { connect, describeTarget } from "./lib/db";
import { loadGeoNamesText, parseGeoNames } from "./lib/geonames";
import { generateGrid } from "./lib/grid";
import { buildDestinations } from "./lib/tourism";

const POINT = "ST_SetSRID(ST_MakePoint(%lon%, %lat%), 4326)::GEOGRAPHY";
const point = (lon: string, lat: string) => POINT.replace("%lon%", lon).replace("%lat%", lat);

async function main() {
  console.log(`Datenbank: ${describeTarget()}\n`);

  console.log("1/4 Raster generieren");
  const grid = generateGrid();
  console.log(`   ${grid.length} Rasterpunkte über der DACH-Bounding-Box`);

  console.log("2/4 Orte laden");
  const places = parseGeoNames(await loadGeoNamesText());
  if (places.length === 0) throw new Error("Keine Orte für DE/AT/CH im GeoNames-Datensatz gefunden.");
  const { destinations, curatedMatched, curatedAdded } = buildDestinations(places);
  console.log(`   ${places.length} Orte aus GeoNames, ${curatedMatched} kuratierte Ziele zugeordnet`);
  if (curatedAdded.length > 0) {
    console.log(`   ${curatedAdded.length} kuratierte Ziele ergänzt (nicht in GeoNames): ${curatedAdded.join(", ")}`);
  }

  console.log("3/4 In die Datenbank schreiben");
  const client = await connect();
  try {
    const check = await client.query("SELECT to_regclass('public.destinations') AS t");
    if (!check.rows[0].t) {
      throw new Error("Die Tabellen fehlen noch. Bitte zuerst die Migration ausführen: npm run db:migrate");
    }

    await client.query("BEGIN");
    await client.query("DROP TABLE IF EXISTS _seed_staging");
    await client.query("TRUNCATE weather_forecasts_daily, destinations, weather_grid RESTART IDENTITY CASCADE");

    // Rasterpunkte
    await client.query(
      `INSERT INTO weather_grid (lat, lon, geom)
       SELECT t.lat, t.lon, ${point("t.lon", "t.lat")}
       FROM unnest($1::float8[], $2::float8[]) AS t(lat, lon)`,
      [grid.map((g) => g.lat), grid.map((g) => g.lon)]
    );

    // Orte zunächst in eine Zwischentabelle laden
    await client.query(
      `CREATE TABLE _seed_staging (
         name text, country_code text, admin_region text, lat float8, lon float8,
         population int, elevation int, tourism_score int, tags text, grid_id int
       )`
    );
    await client.query(
      `INSERT INTO _seed_staging (name, country_code, admin_region, lat, lon, population, elevation, tourism_score, tags)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[], $6::int[], $7::int[], $8::int[], $9::text[])`,
      [
        destinations.map((d) => d.name.slice(0, 255)),
        destinations.map((d) => d.countryCode),
        destinations.map((d) => d.adminRegion),
        destinations.map((d) => d.lat),
        destinations.map((d) => d.lon),
        destinations.map((d) => d.population),
        destinations.map((d) => d.elevation),
        destinations.map((d) => d.tourismScore),
        destinations.map((d) => d.tags.join(",")),
      ]
    );

    // Nearest-Grid-Zuweisung per PostGIS (KNN-Operator <-> auf dem GIST-Index)
    await client.query(
      `UPDATE _seed_staging s
       SET grid_id = (
         SELECT g.grid_id FROM weather_grid g
         ORDER BY g.geom <-> ${point("s.lon", "s.lat")}
         LIMIT 1
       )`
    );

    await client.query(
      `INSERT INTO destinations (name, country_code, admin_region, lat, lon, geom, population, tourism_score, tags, grid_id)
       SELECT s.name, s.country_code, s.admin_region, s.lat, s.lon, ${point("s.lon", "s.lat")},
              s.population, s.tourism_score,
              CASE WHEN s.tags = '' THEN ARRAY[]::text[] ELSE string_to_array(s.tags, ',') END,
              s.grid_id
       FROM _seed_staging s
       ORDER BY s.tourism_score DESC, s.population DESC`
    );

    // Rasterpunkte mit Land und mittlerer Höhe ihrer Orte anreichern
    await client.query(
      `UPDATE weather_grid g
       SET region_code = a.country_code, elevation = a.elevation
       FROM (
         SELECT grid_id,
                mode() WITHIN GROUP (ORDER BY country_code) AS country_code,
                ROUND(AVG(elevation))::int AS elevation
         FROM _seed_staging GROUP BY grid_id
       ) a
       WHERE g.grid_id = a.grid_id`
    );

    // Rasterpunkte ohne zugeordnete Orte löschen (offenes Meer, Ausland)
    const removed = await client.query(
      `DELETE FROM weather_grid g
       WHERE NOT EXISTS (SELECT 1 FROM destinations d WHERE d.grid_id = g.grid_id)`
    );
    await client.query("DROP TABLE _seed_staging");
    await client.query("COMMIT");
    await client.query("ANALYZE weather_grid");
    await client.query("ANALYZE destinations");

    console.log("4/4 Ergebnis");
    const stats = await client.query(
      `SELECT (SELECT COUNT(*) FROM weather_grid)::int AS grids,
              (SELECT COUNT(*) FROM destinations)::int AS destinations,
              (SELECT COUNT(*) FROM destinations WHERE tourism_score >= 72)::int AS curated`
    );
    const byCountry = await client.query(
      `SELECT country_code, COUNT(*)::int AS n FROM destinations GROUP BY country_code ORDER BY country_code`
    );
    const s = stats.rows[0];
    console.log(`   ${s.grids} aktive Rasterpunkte (${removed.rowCount ?? 0} ohne Orte entfernt)`);
    console.log(`   ${s.destinations} Orte, davon ${s.curated} Top-Ausflugsziele`);
    console.log(`   ${byCountry.rows.map((r) => `${r.country_code}: ${r.n}`).join(" · ")}`);
    console.log("\nSeed abgeschlossen. Wetterdaten folgen in Phase 2 (Open-Meteo-Sync).");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\nSeed fehlgeschlagen:\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
