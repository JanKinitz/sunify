// D – Karte (siehe e2e/TESTFAELLE.md)
import { expect, test } from "@playwright/test";
import { BROAD_SEARCH, openApp, waitForSearchDone } from "./helpers";

test.describe("D Karte", () => {
  test("D1 Wetter-Pills erscheinen und öffnen die Detailansicht", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const pills = page.locator(".sunify-pill:not(.is-cluster)");
    const clusters = page.locator(".sunify-pill.is-cluster");
    await expect(pills.or(clusters).first()).toBeVisible();
    test.skip((await pills.count()) === 0, "Nur Sammel-Pills sichtbar – kein einzelner Ort anklickbar");
    await pills.first().click();
    await expect(page.getByRole("dialog", { name: /Details zu/ })).toBeVisible();
  });

  test("D2 Sammel-Pill zoomt in die Gruppe", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const clusters = page.locator(".sunify-pill.is-cluster");
    test.skip((await clusters.count()) === 0, "Keine Sammel-Pill bei diesem Wetter");
    const singles = page.locator(".sunify-pill:not(.is-cluster)");
    const before = await singles.count();
    await clusters.first().click();
    await page.waitForTimeout(1500); // Zoom-Animation
    expect(await singles.count(), "nach dem Hineinzoomen mindestens so viele Einzelorte").toBeGreaterThanOrEqual(before);
  });

  test("D3 Legende und Radius-Kreis passen zur Suche", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    await expect(page.getByTestId("map-legend")).toContainText(/\d+ Treffer · /);
    await expect(page.locator(".sunify-origin")).toBeVisible();
    await expect(page.locator('path[stroke="#f98307"]').first()).toBeAttached();
  });
});
