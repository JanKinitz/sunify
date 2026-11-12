// Prüft den Stand der Datenbank nach Migration und Seed.
// Aufruf: npm run db:check

import { connect, describeTarget } from "./lib/db";

async function main() {
  console.log(`Datenbank: ${describeTarget()}\n`);
  const client = await connect();
  try {
    const counts = await client.query(
      `SELECT (SELECT COUNT(*) FROM weather_grid)::int AS grids,
              (SELECT COUNT(*) FROM destinations)::int AS destinations,
              (SELECT COUNT(*) FROM weather_forecasts_daily)::int AS forecasts,
              (SELECT ROUND(AVG(n), 1) FROM (SELECT COUNT(*) AS n FROM destinations GROUP BY grid_id) x) AS per_grid`
    );
    const c = counts.rows[0];
    console.log(`Rasterpunkte:      ${c.grids}`);
    console.log(`Orte:              ${c.destinations} (Ø ${c.per_grid ?? 0} je Rasterpunkt)`);
    console.log(`Wetterprognosen:   ${c.forecasts}${c.forecasts === 0 ? "  (leer bis Phase 2)" : ""}`);

    // Stichprobe: beste Ausflugsziele im 200-km-Radius um Stuttgart
    const sample = await client.query(
      `SELECT d.name, d.admin_region, d.tourism_score, d.tags, d.grid_id,
              ROUND((ST_Distance(d.geom, o.geom) / 1000)::numeric)::int AS km
       FROM destinations d,
            (SELECT ST_SetSRID(ST_MakePoint(9.1829, 48.7758), 4326)::GEOGRAPHY AS geom) o
       WHERE ST_DWithin(d.geom, o.geom, 200000)
       ORDER BY d.tourism_score DESC, d.population DESC
       LIMIT 10`
    );
    console.log("\nTop 10 im 200-km-Radius um Stuttgart:");
    for (const r of sample.rows) {
      console.log(
        `  ${String(r.tourism_score).padStart(3)}  ${String(r.name).padEnd(28)} ${String(r.km).padStart(3)} km  Raster ${r.grid_id}  [${(r.tags ?? []).join(", ")}]`
      );
    }

    // Die Suchfunktion muss sich aufrufen lassen (liefert ohne Wetterdaten 0 Zeilen)
    const search = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM search_weather_destinations(48.7758, 9.1829, 200000, CURRENT_DATE, CURRENT_DATE + 1, 5, 1, 30, 0, 100)`
    );
    console.log(`\nsearch_weather_destinations(): aufrufbar, ${search.rows[0].n} Treffer`);

    if (c.grids === 0 || c.destinations === 0) {
      console.log("\nHinweis: Die Tabellen sind leer – bitte npm run db:seed ausführen.");
      process.exitCode = 1;
    } else {
      console.log("\nPhase 1 ist vollständig eingerichtet.");
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\nPrüfung fehlgeschlagen:\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
