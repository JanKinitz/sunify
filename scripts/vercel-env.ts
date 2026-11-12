// Überträgt die für den Betrieb nötigen Umgebungsvariablen aus .env.local in das
// verknüpfte Vercel-Projekt (Umgebung "production"). Die Werte werden nie angezeigt.
// Aufruf: npm run deploy:env   (setzt "vercel login" und "vercel link" voraus)

import { spawnSync } from "node:child_process";
import { loadEnv } from "./lib/db";

const REQUIRED = ["DATABASE_URL", "CRON_SECRET"];
const OPTIONAL = ["NEXT_PUBLIC_BOOKING_AFFILIATE_ID"];

function vercel(args: string[], input?: string): number {
  const result = spawnSync("npx", ["--yes", "vercel@latest", ...args], {
    shell: true,
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (result.status !== 0 && result.stderr) {
    // Fehlermeldungen der CLI zeigen, aber niemals den übergebenen Wert
    const message = input ? result.stderr.split(input).join("***") : result.stderr;
    process.stderr.write(message);
  }
  return result.status ?? 1;
}

function main() {
  loadEnv();
  const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    console.error(`In .env.local fehlen: ${missing.join(", ")}`);
    process.exit(1);
  }

  // Version 1.0 läuft auf Vercel mit der alten Datenbank; seit Version 2.0 steht sie als DATABASE_URL_V1 in .env.local
  if (process.env.DATABASE_URL_V1?.trim()) process.env.DATABASE_URL = process.env.DATABASE_URL_V1.trim();

  const keys = [...REQUIRED, ...OPTIONAL.filter((key) => process.env[key]?.trim())];
  for (const key of keys) {
    const value = process.env[key]!.trim();
    process.stdout.write(`→ ${key} … `);
    // Vorhandenen Wert ersetzen: erst entfernen (Fehler, falls nicht vorhanden, ist unkritisch)
    spawnSync("npx", ["--yes", "vercel@latest", "env", "rm", key, "production", "--yes"], {
      shell: true,
      stdio: "ignore",
    });
    const status = vercel(["env", "add", key, "production"], value);
    if (status !== 0) {
      console.log("FEHLER");
      process.exit(1);
    }
    console.log("ok");
  }
  console.log("Umgebungsvariablen sind bei Vercel hinterlegt.");
}

main();
