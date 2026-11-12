// Legt in .env.local ein zufälliges CRON_SECRET an, falls noch keines existiert.
// Der Wert wird bewusst nicht ausgegeben. Aufruf: npm run weather:secret

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const file = ".env.local";
const current = existsSync(file) ? readFileSync(file, "utf8") : "";

if (/^CRON_SECRET=.+$/m.test(current)) {
  console.log("CRON_SECRET ist bereits in .env.local vorhanden.");
} else {
  const prefix = current === "" || current.endsWith("\n") ? "" : "\n";
  appendFileSync(
    file,
    `${prefix}\n# Schützt die Route GET /api/cron/sync-weather (Header: Authorization: Bearer <Wert>)\nCRON_SECRET=${randomBytes(24).toString("hex")}\n`,
    "utf8"
  );
  console.log("CRON_SECRET wurde in .env.local angelegt.");
}
