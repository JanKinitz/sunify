// Stellt .env.local auf zwei Datenbanken um:
//   DATABASE_URL_V1 = bisherige Datenbank (Version 1.0, läuft weiter auf Vercel)
//   DATABASE_URL    = neue, leere Datenbank für Version 2.0
// Werte werden nie angezeigt. Exit-Code 2 = Nutzer muss die neue URL noch eintragen.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = ".env.local";
if (!existsSync(FILE)) {
  console.error(".env.local fehlt – bitte zuerst setup-database.bat (Version 1.0) ausführen.");
  process.exit(1);
}

let text = readFileSync(FILE, "utf8");
const get = (key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";

if (!/^DATABASE_URL_V1=/m.test(text)) {
  if (!get("DATABASE_URL")) {
    console.error("In .env.local steht keine DATABASE_URL.");
    process.exit(1);
  }
  text = text.replace(
    /^DATABASE_URL=(.*)$/m,
    [
      "# Datenbank der Version 1.0 (läuft weiter auf Vercel) – nicht ändern",
      "DATABASE_URL_V1=$1",
      "",
      "# Datenbank der Version 2.0: Verbindungs-URL des NEUEN Supabase-Projekts hier eintragen",
      "# (Supabase → Connect → Session pooler; [YOUR-PASSWORD] durch das neue Passwort ersetzen)",
      "DATABASE_URL=",
    ].join("\n")
  );
  writeFileSync(FILE, text, "utf8");
  console.log("Die bisherige Datenbank ist jetzt als DATABASE_URL_V1 hinterlegt.");
}

const v1 = get("DATABASE_URL_V1");
const v2 = get("DATABASE_URL");
if (!v2 || v2.includes("[YOUR-PASSWORD]") || v2.includes("DEIN-PASSWORT")) {
  console.log("Bitte die Verbindungs-URL der neuen Datenbank in der Zeile DATABASE_URL eintragen.");
  process.exit(2);
}
if (v2 === v1) {
  console.log("DATABASE_URL zeigt noch auf die Datenbank von Version 1.0 – bitte die URL des neuen Projekts eintragen.");
  process.exit(2);
}
console.log("Datenbank für Version 2.0 ist eingetragen.");
