// Richtet Sunify 2.0 bei Netlify ein – ohne Klicks im Netlify-Dashboard (bis auf den Zugangsschlüssel):
//  1. Zugangsschlüssel (Personal Access Token) abfragen und prüfen – die Eingabe bleibt unsichtbar
//  2. Website bei Netlify anlegen (Name "sunify", sonst mit Zusatz) bzw. die bereits angelegte wiederverwenden
//  3. DATABASE_URL aus .env.local als Umgebungsvariable der Website hinterlegen
//  4. Schlüssel und Website-ID als GitHub-Secrets speichern, damit GitHub Actions veröffentlichen kann
// Aufruf: node scripts/netlify-setup.mjs   (setzt "gh auth login" voraus)

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import readline from "node:readline";

const API = "https://api.netlify.com/api/v1";
const STATE_FILE = ".netlify/state.json";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* Datei fehlt */
  }
}

function fail(message) {
  console.error(`\nFEHLER: ${message}`);
  process.exit(1);
}

/** Fragt einen Wert ab, ohne ihn im Fenster anzuzeigen. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (text) => {
      if (!muted) rl.output.write(text);
      else if (text.includes("\n") || text.includes("\r")) rl.output.write("\n");
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    muted = true;
  });
}

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "sunify-setup" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function setGithubSecret(key, value) {
  const result = spawnSync("gh", ["secret", "set", key], { input: value, encoding: "utf8", shell: false });
  if (result.status !== 0) {
    if (result.stderr) console.error(result.stderr.split(value).join("***"));
    fail(`${key} konnte nicht bei GitHub hinterlegt werden.`);
  }
  console.log(`   → ${key} als GitHub-Secret hinterlegt`);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl || databaseUrl.includes("DEIN-PASSWORT") || databaseUrl.includes("[YOUR-PASSWORD]")) {
  fail("DATABASE_URL fehlt in .env.local.");
}

// 1) Zugangsschlüssel
let token = process.env.NETLIFY_AUTH_TOKEN?.trim() ?? "";
let user = null;
for (let attempt = 0; attempt < 3 && !user; attempt++) {
  if (!token) {
    console.log("");
    token = await askHidden("Netlify-Zugangsschluessel einfuegen (Rechtsklick) und Enter druecken (bleibt unsichtbar): ");
  }
  if (!token) continue;
  const res = await api(token, "GET", "/user");
  if (res.ok) user = res.data;
  else {
    console.log("   Dieser Schluessel wurde von Netlify nicht angenommen. Bitte erneut versuchen.");
    token = "";
  }
}
if (!user) fail("Kein gültiger Netlify-Zugangsschlüssel.");
console.log(`[1/4] Bei Netlify angemeldet als ${user.full_name || user.email || user.slug}`);

// 2) Website anlegen oder wiederverwenden
const accounts = await api(token, "GET", "/accounts");
if (!accounts.ok || !Array.isArray(accounts.data) || accounts.data.length === 0) fail("Kein Netlify-Team gefunden.");
const account = accounts.data[0];

const state = readState();
let site = null;
if (state.siteId) {
  const res = await api(token, "GET", `/sites/${state.siteId}`);
  if (res.ok) site = res.data;
}
if (!site) {
  const names = ["sunify", "sunify-app", `sunify-${randomBytes(3).toString("hex")}`, `sunify-${randomBytes(3).toString("hex")}`];
  for (const name of names) {
    const res = await api(token, "POST", `/${account.slug}/sites`, { name });
    if (res.ok) {
      site = res.data;
      break;
    }
    if (res.status !== 422) fail(`Website konnte nicht angelegt werden (Netlify meldet ${res.status}).`);
  }
  if (!site) fail("Kein freier Website-Name gefunden.");
  mkdirSync(".netlify", { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ siteId: site.id }, null, 2));
}
const url = site.ssl_url || site.url;
console.log(`[2/4] Website: ${url}`);

// 3) Datenbank-Zugang als Umgebungsvariable der Website (Wert wird nicht angezeigt)
const envBody = { key: "DATABASE_URL", values: [{ value: databaseUrl, context: "all" }] };
let envRes = await api(token, "POST", `/accounts/${account.id}/env?site_id=${site.id}`, [envBody]);
if (!envRes.ok) {
  envRes = await api(token, "PUT", `/accounts/${account.id}/env/DATABASE_URL?site_id=${site.id}`, envBody);
}
if (!envRes.ok) fail(`DATABASE_URL konnte nicht bei Netlify hinterlegt werden (Status ${envRes.status}).`);
console.log("[3/4] Datenbank-Zugang bei Netlify hinterlegt");

// 4) GitHub-Secrets für die automatische Veröffentlichung
console.log("[4/4] Zugang fuer GitHub Actions hinterlegen ...");
setGithubSecret("NETLIFY_AUTH_TOKEN", token);
setGithubSecret("NETLIFY_SITE_ID", site.id);

writeFileSync(".netlify/url.txt", url);
console.log(`\nNetlify ist eingerichtet: ${url}`);
