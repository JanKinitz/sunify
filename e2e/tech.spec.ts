// G – Technik, App-Installation, Updates, Datenstand, Quellen (siehe e2e/TESTFAELLE.md)
import { expect, test } from "@playwright/test";
import { berlinDate, BROAD_SEARCH, isMobile, openApp, openResults, waitForSearchDone } from "./helpers";

test.describe("G Technik", () => {
  test("G1 App-Manifest und Icons (installierbar)", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBeTruthy();
    for (const icon of manifest.icons as { src: string }[]) {
      expect((await request.get(icon.src)).ok(), icon.src).toBeTruthy();
    }
    expect((await request.get("/sw.js")).ok()).toBeTruthy();
  });

  test("G2 Datenstand: Orte, Raster und Prognosen für mindestens 7 Tage", async ({ request }) => {
    const res = await request.get("/api/status");
    expect(res.ok()).toBeTruthy();
    const text = JSON.stringify(await res.json());
    const num = (key: string) => Number(new RegExp(`"${key}":(\\d+)`).exec(text)?.[1] ?? 0);
    expect(num("destinations"), "Orte").toBeGreaterThan(100_000);
    expect(num("grid_points"), "Rasterpunkte").toBeGreaterThan(10_000);
    expect(num("forecasts"), "Prognosen").toBeGreaterThan(10_000);
    const lastDay = /"last_day":"(\d{4}-\d{2}-\d{2})"/.exec(text)?.[1] ?? "";
    const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect(lastDay >= inAWeek, `Prognose reicht bis ${lastDay}`).toBeTruthy();
  });

  test("G3 Build-Kennung für die Update-Erkennung", async ({ request }) => {
    const res = await request.get("/api/version");
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).build).toBeTruthy();
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("G4 Keine Fehler in der Browser-Konsole", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const relevant = errors.filter((e) => !/favicon|Failed to load resource.*(tile|commons|wikimedia)/i.test(e));
    expect(relevant).toEqual([]);
  });

  test("G5 Neue Version: Hinweis „Aktualisieren“ erscheint", async ({ page }) => {
    const res = await page.request.get("/api/version");
    test.skip((await res.json()).build === "dev", "Update-Erkennung nur in der veröffentlichten Version aktiv");
    await page.route("**/api/version", (route) => route.fulfill({ json: { build: "neuere-version" } }));
    await openApp(page);
    const banner = page.getByTestId("update-banner");
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("button", { name: "Aktualisieren" })).toBeVisible();
  });

  test("G6 Quellenangaben unter der Ergebnisliste", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const list = await openResults(page);
    for (const source of ["Open-Meteo.com", "NOAA GFS", "GeoNames", "Wikimedia Commons", "OpenStreetMap"]) {
      await expect(list.getByText(source, { exact: false }).first()).toBeAttached();
    }
    if (isMobile(page)) await page.getByTestId("show-map").click();
  });

  test("G7 Antwortzeit der Suche (300 km, alles „egal“) unter 8 Sekunden", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Server-Messung einmal pro Lauf genügt");
    const today = new Date();
    const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    const body = {
      originLat: 48.1372,
      originLon: 11.5756,
      radiusKm: 300,
      startDate: day(1),
      endDate: day(2),
      criteria: { minTempMax: -60, maxPrecipitationSum: null, maxWindSpeed: 500, minSunshineHours: 0 },
      tolerance: 0,
      category: "all",
      limit: 100,
      favoriteIds: [],
    };
    const durations: number[] = [];
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      const res = await request.post("/api/search", { data: body, timeout: 60_000 });
      durations.push(Date.now() - started);
      expect(res.ok()).toBeTruthy();
      const json = await res.json();
      testInfo.annotations.push({
        type: `Lauf ${i + 1}`,
        description: `gesamt ${durations[i]} ms, Server ${json.meta?.tookMs} ms, Schritte ${JSON.stringify(json.meta?.timings ?? {})}, Treffer ${json.totalMatches}`,
      });
    }
    console.log("G7 Antwortzeiten:", testInfo.annotations.map((a) => `${a.type}: ${a.description}`).join(" | "));
    const best = Math.min(...durations);
    expect(best, `schnellste von 3 Suchen: ${best} ms`).toBeLessThan(8000);
  });

  test("G8 Prognosen weltweit: in jeder Zeitzone Treffer für das Wochenende", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Server-Prüfung einmal pro Lauf genügt");
    // Wochenende wie in der App (Berliner Datum): Samstag und Sonntag dieser Woche, ab Samstag der laufende
    const berlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const dow = berlin.getDay(); // 0 = Sonntag
    const toSat = dow === 0 ? -1 : 6 - dow;
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const sat = new Date(berlin.getFullYear(), berlin.getMonth(), berlin.getDate() + toSat);
    const sun = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 1);
    const places = [
      { name: "Christchurch (UTC+13)", lat: -43.53, lon: 172.64 },
      { name: "Tokio (UTC+9)", lat: 35.68, lon: 139.76 },
      { name: "Kapstadt (UTC+2)", lat: -33.92, lon: 18.42 },
      { name: "Denver (UTC−7)", lat: 39.74, lon: -104.99 },
      { name: "Honolulu (UTC−10)", lat: 21.31, lon: -157.86 },
      { name: "Buenos Aires (UTC−3)", lat: -34.6, lon: -58.38 },
    ];
    for (const p of places) {
      const res = await request.post("/api/search", {
        timeout: 60_000,
        data: {
          originLat: p.lat,
          originLon: p.lon,
          radiusKm: 200,
          startDate: iso(sat),
          endDate: iso(sun),
          criteria: { minTempMax: -60, maxPrecipitationSum: null, maxWindSpeed: 500, minSunshineHours: 0 },
          tolerance: 0,
          category: "all",
          limit: 10,
          favoriteIds: [],
        },
      });
      expect(res.ok(), p.name).toBeTruthy();
      const json = await res.json();
      expect.soft(json.totalMatches, `${p.name}: Orte mit Prognose für ${iso(sat)}–${iso(sun)}`).toBeGreaterThan(0);
    }
  });

  test("G9 Graue Punkte nur für Orte, deren Wetter nicht passt", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Server-Prüfung einmal pro Lauf genügt");
    const base = {
      originLat: 48.1372,
      originLon: 11.5756,
      radiusKm: 300,
      startDate: berlinDate(1),
      endDate: berlinDate(2),
      tolerance: 0,
      category: "all",
      limit: 100,
      favoriteIds: [],
    };
    // Alles „egal“: jeder Ort passt – es darf keinen grauen Punkt geben, auch bei Tausenden Treffern
    const all = await (await request.post("/api/search", {
      timeout: 60_000,
      data: { ...base, criteria: { minTempMax: -60, maxPrecipitationSum: null, maxWindSpeed: 500, minSunshineHours: 0 } },
    })).json();
    expect(all.totalMatches).toBeGreaterThan(100);
    expect(all.otherIds, "graue Punkte bei „alles egal“").toEqual([]);
    // Strenge Suche: graue Punkte und Treffer überschneiden sich nie
    const strict = await (await request.post("/api/search", {
      timeout: 60_000,
      data: { ...base, criteria: { minTempMax: 15, maxPrecipitationSum: 0, maxWindSpeed: 20, minSunshineHours: 4 } },
    })).json();
    const hits = new Set((strict.matches as { id: number }[]).map((m) => m.id));
    expect((strict.otherIds as number[]).filter((id) => hits.has(id))).toEqual([]);
  });
});

