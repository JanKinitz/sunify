// Gemeinsame Datenbank-Anbindung für die Phase-1-Skripte (Migration, Seed, Prüfung).
// Verbindet sich über DATABASE_URL mit Supabase oder einer lokalen PostGIS-Instanz (Docker).

import { Client } from "pg";

/** Lädt .env.local bzw. .env, ohne zusätzliche Abhängigkeit (Node ≥ 20.12). */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* Datei nicht vorhanden – ignorieren */
    }
  }
}

export function getDatabaseUrl(): string {
  loadEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url || url.includes("DEIN-PASSWORT") || url.includes("[YOUR-PASSWORD]")) {
    throw new Error(
      [
        "DATABASE_URL fehlt oder enthält noch den Platzhalter.",
        "Trage die Verbindungs-URL deiner Datenbank in die Datei .env.local ein",
        "(Vorlage: .env.example). Sonderzeichen im Passwort müssen URL-kodiert sein.",
      ].join("\n")
    );
  }
  return url;
}

/** Verbindungsparameter für pg.Client und pg.Pool. */
export function connectionOptions(): { connectionString: string; ssl?: { rejectUnauthorized: boolean } } {
  const url = getDatabaseUrl();
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL ist keine gültige URL (erwartet: postgresql://nutzer:passwort@host:port/datenbank).");
  }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  return {
    connectionString: url,
    // Supabase verlangt TLS; das Zertifikat stammt von einer Supabase-eigenen CA.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  };
}

export async function connect(): Promise<Client> {
  const client = new Client(connectionOptions());
  await client.connect();
  return client;
}

/** Host der Datenbank für Konsolenausgaben – niemals die komplette URL mit Passwort ausgeben. */
export function describeTarget(): string {
  try {
    const u = new URL(getDatabaseUrl());
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unbekannt)";
  }
}
