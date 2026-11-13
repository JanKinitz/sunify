// Gemeinsame Hilfsfunktionen der Testbibliothek.
// Die App hat zwei Layouts: Desktop (ab 1024 px, Filter links, Liste rechts) und Mobil
// (Filter und Liste als Vollbild-/Bottom-Sheet). Die Helfer verbergen diesen Unterschied.

import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/** Mobiles Layout? (Tailwind-Breakpoint lg = 1024 px) */
export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 1024;
}

/** Startort-Eingabe in der Top-Bar */
export function originInput(page: Page): Locator {
  return page.locator("#sunify-origin");
}

/** App öffnen (optional mit Such-Parametern wie in einem geteilten Link) */
export async function openApp(page: Page, query = ""): Promise<void> {
  await page.goto(query ? `/?${query}` : "/");
  await expect(originInput(page)).toBeVisible();
}

/** Wartet, bis die nächste Antwort von /api/search da ist (vor der auslösenden Aktion aufrufen). */
export function nextSearch(page: Page) {
  return page.waitForResponse((r) => r.url().includes("/api/search") && r.request().method() === "POST", {
    timeout: 60_000,
  });
}

/** Wartet, bis die Legende keine laufende Suche mehr meldet. */
export async function waitForSearchDone(page: Page): Promise<void> {
  await expect(page.getByTestId("map-legend")).not.toContainText(/Suche läuft|Searching/, { timeout: 60_000 });
}

/** Startort aus der Vorschlagsliste wählen (beliebte Orte, ohne externe Ortssuche) */
export async function chooseOrigin(page: Page, name = "München"): Promise<void> {
  const searched = nextSearch(page);
  await originInput(page).click();
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await searched;
  await waitForSearchDone(page);
}

/** Umkreis in der Top-Bar setzen */
export async function chooseRadius(page: Page, km: number): Promise<void> {
  await page.getByTitle(/Suchradius|Search radius/).selectOption(String(km));
}

/** Bereich mit dem Filter-Cockpit (mobil wird das Sheet geöffnet) */
export async function openFilters(page: Page): Promise<Locator> {
  if (!isMobile(page)) return page.getByTestId("filters-desktop");
  await page.getByTestId("open-filters").click();
  const sheet = page.getByTestId("filters-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Filter-Sheet schließen (nur mobil, auf dem Desktop ohne Wirkung) */
export async function closeFilters(page: Page): Promise<void> {
  if (isMobile(page)) await page.getByTestId("filters-apply").click();
}

/** Bereich mit der Ergebnisliste (mobil wird das Bottom-Sheet geöffnet) */
export async function openResults(page: Page): Promise<Locator> {
  if (!isMobile(page)) return page.getByTestId("results-desktop");
  const sheet = page.getByTestId("results-sheet");
  const showList = page.getByTestId("show-list");
  if (await showList.isVisible()) await showList.click();
  await expect(sheet).toHaveAttribute("aria-hidden", "false");
  return sheet;
}

/** Breite, ausgelegte Suche, die praktisch immer Treffer liefert (alle Wetter-Regler auf „egal“) */
export const BROAD_SEARCH = "o=muenchen&r=300&d=weekend&t=-5&p=any&w=60&sun=0&c=all";

/** Suche, die praktisch nie Treffer liefert (35 °C, windstill, 12 Std. Sonne, trocken, 50 km) */
export const IMPOSSIBLE_SEARCH = "o=muenchen&r=50&d=tomorrow&t=35&p=dry&w=5&sun=12&c=all";

/** Datum (YYYY-MM-DD) in Berliner Zeit, heute + `days` Tage – wie die App rechnet */
export function berlinDate(days = 0): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Suche, die sicher Fast-Treffer liefert – passend zum aktuellen Wetter: 50 km um München, „Etwas flexibel“.
 * Die Mindesttemperatur wird beim Server ausprobiert (vom Median bis über den wärmsten Ort von morgen),
 * bis unter den geladenen Ergebnissen Fast-Treffer sind. Bei großem Radius füllen volle Treffer sonst alle Plätze.
 */
export async function nearSearchQuery(request: APIRequestContext): Promise<string> {
  const post = (minTemp: number, tolerance: number) =>
    request
      .post("/api/search", {
        timeout: 60_000,
        data: {
          originLat: 48.1372,
          originLon: 11.5756,
          radiusKm: 50,
          startDate: berlinDate(1),
          endDate: berlinDate(1),
          criteria: { minTempMax: minTemp, maxPrecipitationSum: null, maxWindSpeed: 500, minSunshineHours: 0 },
          tolerance,
          category: "all",
          limit: 100,
          favoriteIds: [],
        },
      })
      .then((r) => r.json());

  const all = await post(-60, 0);
  const day = berlinDate(1);
  const temps: number[] = [];
  for (const d of all.destinations as { gridId: number; tempCorrection: number }[]) {
    const f = (all.forecasts[String(d.gridId)] ?? []).find((x: { date: string }) => x.date === day);
    if (f && Number.isFinite(f.tempMax)) temps.push(f.tempMax + (d.tempCorrection ?? 0));
  }
  temps.sort((a, b) => a - b);
  const tried: string[] = [];
  if (temps.length) {
    const from = Math.round(temps[Math.floor(temps.length / 2)]);
    const to = Math.ceil(temps[temps.length - 1]) + 2;
    for (let t = from; t <= to; t++) {
      const res = await post(t, 1);
      const near = (res.matches as { strict: boolean }[]).filter((m) => !m.strict).length;
      tried.push(`${t} °C: ${res.matches.length} Treffer, davon ${near} Fast-Treffer`);
      if (near > 0) {
        console.log(`Fast-Treffer-Suche: ${tried.join(" | ")}`);
        return `o=muenchen&r=50&d=tomorrow&t=${t}&p=any&w=60&sun=0&c=all&tol=1`;
      }
    }
  }
  throw new Error(`Keine Suche mit Fast-Treffern gefunden (${temps.length} Orte, ${tried.join(" | ") || "nichts probiert"})`);
}
