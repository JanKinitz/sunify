// E – Sprache und Einheiten (siehe e2e/TESTFAELLE.md)
import { expect, test } from "@playwright/test";
import { BROAD_SEARCH, closeFilters, isMobile, nextSearch, openApp, openFilters, originInput, waitForSearchDone } from "./helpers";

/** Sprach-/Einheitenschalter: Desktop in der Top-Bar, Handy im Filter-Sheet */
async function settings(page: import("@playwright/test").Page) {
  if (!isMobile(page) || (page.viewportSize()?.width ?? 0) >= 640) return page.locator("header");
  return openFilters(page);
}

test.describe("E Sprache & Einheiten", () => {
  test("E1 Umschalten auf Englisch übersetzt die Oberfläche und lädt Ortsnamen neu", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const area = await settings(page);
    const searched = nextSearch(page);
    await area.getByRole("radio", { name: "EN" }).click();
    await searched; // Sprachwechsel lädt die Ergebnisse neu (Ortsnamen in der neuen Sprache)
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await closeFilters(page);
    await expect(originInput(page)).toHaveValue("Munich");
    await expect(page.getByTestId("map-legend")).toContainText(/match|Searching/);
  });

  test("E2 Fahrenheit und Meilen", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const area = await settings(page);
    await area.getByRole("radio", { name: "°F" }).click();
    await closeFilters(page);
    await expect(page.getByTitle(/Suchradius|Search radius/)).toContainText(/mi/);
    await expect(page.locator(".sunify-pill").first()).toContainText("°F");
  });

  test("E3 Sprache per Link (?lang=en)", async ({ page }) => {
    await openApp(page, `${BROAD_SEARCH}&lang=en`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTitle("Open saved places")).toBeVisible();
  });
});
