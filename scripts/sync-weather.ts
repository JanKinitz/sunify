// Stößt den Wetter-Sync direkt von der Kommandozeile an (ohne laufenden Webserver).
// Aufruf: npm run weather:sync

import { connect, describeTarget } from "./lib/db";
import { syncWeather } from "../services/weatherSync";

async function main() {
  console.log(`Datenbank: ${describeTarget()}`);
  console.log("Wetter-Sync: 14-Tage-Prognose von Open-Meteo für alle Rasterpunkte\n");
  const client = await connect();
  try {
    const result = await syncWeather(client, { log: (message) => console.log(message) });
    console.log(`\n${result.gridsUpdated} von ${result.grids} Rasterpunkten aktualisiert`);
    console.log(`${result.rowsUpserted} Tageswerte gespeichert, ${result.removedOldRows} abgelaufene entfernt`);
    if (result.skippedDays > 0) console.log(`${result.skippedDays} unvollständige Tageswerte übersprungen`);
    console.log(`Dauer: ${(result.durationMs / 1000).toFixed(1)} s`);

    const stats = await client.query(
      `SELECT COUNT(*)::int AS n, MIN(forecast_date)::text AS first, MAX(forecast_date)::text AS last,
              ROUND(MIN(temp_max)::numeric, 1) AS tmin, ROUND(MAX(temp_max)::numeric, 1) AS tmax
       FROM weather_forecasts_daily`
    );
    const s = stats.rows[0];
    console.log(`\nIn der Datenbank: ${s.n} Tageswerte vom ${s.first} bis ${s.last} (Höchstwerte ${s.tmin} bis ${s.tmax} °C)`);

    if (result.failedBatches.length > 0) {
      console.log(`\nAchtung: ${result.failedBatches.length} Batch(es) fehlgeschlagen:`);
      for (const f of result.failedBatches) console.log(`  Batch ${f.batch}: ${f.error}`);
      process.exitCode = 1;
    } else {
      console.log("\nWetter-Sync abgeschlossen.");
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\nWetter-Sync fehlgeschlagen:\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
