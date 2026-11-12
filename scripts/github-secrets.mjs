// Hinterlegt die Zugangsdaten als verschlüsselte GitHub-Secrets (für die Datenjobs in GitHub Actions).
// Die Werte werden über die Standardeingabe übergeben und nie angezeigt.
// Aufruf: node scripts/github-secrets.mjs   (setzt "gh auth login" voraus)

import { spawnSync } from "node:child_process";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* Datei fehlt */
  }
}

const SECRETS = ["DATABASE_URL"];
for (const key of SECRETS) {
  const value = process.env[key]?.trim();
  if (!value) {
    console.error(`${key} fehlt in .env.local.`);
    process.exit(1);
  }
  const result = spawnSync("gh", ["secret", "set", key], { input: value, encoding: "utf8", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`${key} konnte nicht hinterlegt werden.`);
    if (result.stderr) console.error(result.stderr.split(value).join("***"));
    process.exit(1);
  }
  console.log(`→ ${key} als GitHub-Secret hinterlegt`);
}
