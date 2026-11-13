// G – Technik, App-Installation, Updates, Datenstand, Quellen (siehe e2e/TESTFAELLE.md)
import { expect, test } from "@playwright/test";
import { BROAD_SEARCH, isMobile, openApp, openResults, waitForSearchDone } from "./helpers";

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
});
