// F – Handy-Bedienung und Layout (siehe e2e/TESTFAELLE.md)
import { expect, test } from "@playwright/test";
import { BROAD_SEARCH, IMPOSSIBLE_SEARCH, isMobile, openApp, openFilters, waitForSearchDone } from "./helpers";

test.describe("F Mobil & Layout", () => {
  test("F1 Bottom-Sheet: Liste öffnen und zurück zur Karte", async ({ page }) => {
    test.skip(!isMobile(page), "nur Handy-Ansicht");
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const showList = page.getByTestId("show-list");
    await expect(showList).toContainText(/Liste anzeigen \(\d+ Treffer\)|Liste anzeigen \(1 Treffer\)/);
    await showList.click();
    await expect(page.getByTestId("results-sheet")).toHaveAttribute("aria-hidden", "false");
    await page.getByTestId("show-map").click();
    await expect(page.getByTestId("results-sheet")).toHaveAttribute("aria-hidden", "true");
  });

  test("F2 Filter-Sheet: öffnen, Button zeigt Trefferzahl, schließen", async ({ page }) => {
    test.skip(!isMobile(page), "nur Handy-Ansicht");
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    await openFilters(page);
    await expect(page.getByTestId("filters-apply")).toContainText(/auf der Karte anzeigen|Keine Treffer/);
    await page.getByTestId("filters-apply").click();
    await expect(page.getByTestId("filters-sheet")).toBeHidden();
  });

  test("F3 Startort und Umkreis sind ohne Scrollen sofort sichtbar", async ({ page }) => {
    await openApp(page);
    const input = page.locator("#sunify-origin");
    const radius = page.getByTitle("Suchradius");
    await expect(input).toBeInViewport();
    await expect(radius).toBeInViewport();
    const box = await input.boundingBox();
    expect(box!.y, "Startort steht im oberen Bildschirmbereich").toBeLessThan(200);
  });

  test("F4 Kein seitliches Scrollen, nichts ragt aus dem Bildschirm", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("F5 Bedienelemente sind groß genug zum Tippen (mind. 32 px)", async ({ page }) => {
    test.skip(!isMobile(page), "nur Handy-Ansicht");
    await openApp(page, BROAD_SEARCH);
    for (const target of [page.locator("#sunify-origin"), page.getByTitle("Suchradius"), page.getByTestId("open-filters"), page.getByTitle("Merkliste öffnen")]) {
      const box = await target.boundingBox();
      expect(box, "Element sichtbar").not.toBeNull();
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(32);
    }
  });

  test("F6 Keine Treffer: Liste klappt von selbst auf und zeigt die Vorschläge", async ({ page }) => {
    test.skip(!isMobile(page), "nur Handy-Ansicht");
    await openApp(page, IMPOSSIBLE_SEARCH);
    await waitForSearchDone(page);
    const sheet = page.getByTestId("results-sheet");
    await expect(sheet).toHaveAttribute("aria-hidden", "false");
    await expect(sheet.getByTestId("empty-state")).toBeVisible();
    // zugeklappt: der Knopf weist auf die Vorschläge hin, statt „0 Treffer“ zu zeigen
    await page.getByTestId("show-map").click();
    await expect(sheet).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByTestId("show-list")).toContainText("Keine Treffer – Vorschläge ansehen");
  });
});
