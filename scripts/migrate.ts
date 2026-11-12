// Führt alle SQL-Migrationen aus supabase/migrations/ in alphabetischer Reihenfolge aus.
// Die Skripte sind idempotent (IF NOT EXISTS / CREATE OR REPLACE) – mehrfaches Ausführen ist unkritisch.
// Aufruf: npm run db:migrate

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { connect, describeTarget } from "./lib/db";

async function main() {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`Keine Migrationen in ${dir} gefunden.`);

  console.log(`Datenbank: ${describeTarget()}`);
  const client = await connect();
  try {
    for (const file of files) {
      process.stdout.write(`→ ${file} … `);
      await client.query(readFileSync(path.join(dir, file), "utf8"));
      console.log("ok");
    }
    const { rows } = await client.query("SELECT postgis_version() AS version");
    console.log(`\nMigration abgeschlossen. PostGIS ${rows[0].version}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\nMigration fehlgeschlagen:\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
