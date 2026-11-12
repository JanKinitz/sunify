// Sicherheitsprüfung vor jedem Commit: Bricht ab, wenn Zugangsdaten im Commit landen würden.
// Prüft die zum Commit vorgemerkten Dateien auf .env-Dateien und auf Datenbank-URLs mit Passwort.
// Aufruf: node scripts/git-safety-check.mjs   (Exit-Code 1 = gefunden, Commit nicht ausführen)

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const staged = execFileSync("git", ["diff", "--cached", "--name-only", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const problems = [];
// Beispielwerte aus Doku und Vorlagen, die bewusst im Repository stehen dürfen
const ALLOWED_PLACEHOLDERS = ["DEIN-PASSWORT", "[YOUR-PASSWORD]", "sunify:sunify@", "nutzer:passwort@", "//u:p@"];
const SECRET_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s:/@]+:[^\s@]+@/i, // Datenbank-URL mit Passwort
  /CRON_SECRET\s*=\s*[0-9a-f]{16,}/i,
  /\bsb_secret_[A-Za-z0-9_-]{10,}/, // Supabase Secret Key
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, // JWT (z. B. service_role)
  /\bgh[pousr]_[A-Za-z0-9]{30,}/, // GitHub-Token
  /\bnfp_[A-Za-z0-9]{30,}/, // Netlify-Token
];

for (const file of staged) {
  const name = file.split("/").pop() ?? file;
  if (/^\.env/.test(name) && name !== ".env.example") {
    problems.push(`${file}: Umgebungsdatei mit Zugangsdaten`);
    continue;
  }
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    continue; // gelöschte Datei
  }
  if (size > 2_000_000) continue;
  const text = readFileSync(file, "utf8");
  for (const pattern of SECRET_PATTERNS) {
    const match = text.match(pattern);
    if (match && !ALLOWED_PLACEHOLDERS.some((p) => match[0].includes(p))) {
      problems.push(`${file}: enthält vermutlich ein Passwort oder einen Schlüssel`);
      break;
    }
  }
}

if (problems.length > 0) {
  console.error("ABBRUCH – folgende Dateien dürfen nicht ins Repository:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Sicherheitsprüfung ok (${staged.length} Dateien, keine Zugangsdaten gefunden).`);
