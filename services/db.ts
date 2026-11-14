// Gemeinsamer Verbindungs-Pool für die API-Routen.
// Der Pool wird über globalThis geteilt, damit Hot-Reloads im Entwicklungsmodus
// nicht bei jeder Codeänderung neue Verbindungen öffnen.

import { Pool } from "pg";
import { connectionOptions } from "@/scripts/lib/db";

const globalForPool = globalThis as unknown as { sunifyPoolV2?: Pool };

export function getPool(): Pool {
  if (!globalForPool.sunifyPoolV2) {
    globalForPool.sunifyPoolV2 = new Pool({
      ...connectionOptions(),
      // klein halten: es laufen mehrere Instanzen, Supabase erlaubt nur wenige Verbindungen.
      // 4 erlaubt parallele Lockerungsvorschläge bei Suchen ohne Treffer.
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // PL/pgSQL legt nach wenigen Aufrufen einen generischen Ausführungsplan für die Suchfunktion
    // an, der bei großen Treffermengen in Messungen 10 s und mehr brauchte. Mit dieser
    // Sitzungs-Einstellung plant PostgreSQL jede Suche passend zu ihren Parametern (ca. 0,2–1 s).
    globalForPool.sunifyPoolV2.on("connect", (client: { query: (sql: string) => Promise<unknown> }) => {
      client.query("SET plan_cache_mode = force_custom_plan").catch(() => undefined);
    });
    // Abgebrochene Leerlauf-Verbindungen dürfen den Prozess nicht beenden
    globalForPool.sunifyPoolV2.on("error", (error: Error) => {
      console.error("Datenbank-Pool:", error.message);
    });
  }
  return globalForPool.sunifyPoolV2;
}
