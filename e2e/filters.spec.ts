// B – Filter-Cockpit (siehe e2e/TESTFAELLE.md)
import { expect, test } from "@playwright/test";
import { BROAD_SEARCH, closeFilters, isMobile, nextSearch, openApp, openFilters, originInput, waitForSearchDone } from "./helpers";

test.describe("B Filter", () => {
  test("B1 Aktivitätsprofil setzt passende Wetterfilter", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const filters = await openFilters(page);
    const searched = nextSearch(page);
    await filters.getByRole("button", { name: /Wandern/ }).click();
    await expect(filters.getByRole("button", { name: /Wandern/ })).toHaveAttribute("aria-pressed", "true");
    const body = (await searched).request().postDataJSON();
    expect(body.criteria.minTempMax, "Wandern setzt eine Mindesttemperatur").toBeGreaterThan(-60);
    await expect(page).not.toHaveURL(/t=-5&/);
  });

  test("B2 Temperatur-Regler: „Egal“ am Anschlag, sonst Mindestwert", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    const filters = await openFilters(page);
    const slider = filters.getByRole("slider", { name: "Mindestens (Tageshöchstwert)" });
    await expect(slider).toHaveValue("-5");
    await slider.fill("12");
    await expect(filters.getByText("≥ 12 °C")).toBeVisible();
    await expect(page).toHaveURL(/t=12/);
    await slider.fill("-5");
    await expect(page).toHaveURL(/t=-5/);
  });

  test("B3 Zeitraum-Schnellwahl ändert die Daten", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    const filters = await openFilters(page);
    await filters.getByRole("button", { name: "Nächstes Wochenende" }).click();
    await expect(page).toHaveURL(/d=nextWeekend/);
    await filters.getByRole("button", { name: "Individuell" }).click();
    await expect(filters.getByLabel("Von")).toBeVisible();
    await expect(filters.getByLabel("Bis")).toBeVisible();
  });

  test("B4 Toleranz „Flexibel“ wird an die Suche übergeben", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const filters = await openFilters(page);
    const searched = nextSearch(page);
    await filters.getByRole("radio", { name: /^Flexibel/ }).click();
    expect((await searched).request().postDataJSON().tolerance).toBe(2);
    await expect(page).toHaveURL(/tol=2/);
  });

  test("B5 „Filter zurücksetzen“ behält den Startort", async ({ page }) => {
    await openApp(page, "o=muenchen&r=300&d=weekend&t=20&p=dry&w=20&sun=5&c=water&tol=1");
    const filters = await openFilters(page);
    await filters.getByRole("button", { name: /Filter zurücksetzen/ }).click();
    await expect(page).toHaveURL(/o=muenchen/);
    await expect(page).toHaveURL(/t=-5/);
    await expect(page).toHaveURL(/c=all/);
    await closeFilters(page);
    await expect(originInput(page)).toHaveValue("München");
  });

  test.describe("B6 ohne Service Worker", () => {
  // Der Service Worker übernimmt die Seite (clients.claim) – dann sieht page.route die Suche nicht mehr
  // und die angehaltene Suche läuft trotzdem durch (war auf dem iPhone wackelig).
  test.use({ serviceWorkers: "block" });
  test("B6 Während der Suche keine veraltete Trefferzahl", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    // Suche anhalten, bis der Zwischenzustand geprüft ist (feste Wartezeit war auf dem iPhone zu knapp)
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/search", async (route) => {
      await gate;
      await route.continue();
    });
    const filters = await openFilters(page);
    await filters.getByRole("radio", { name: /^Etwas flexibel/ }).click();
    if (isMobile(page)) {
      await expect(page.getByTestId("filters-apply")).toContainText("Suche läuft");
      await closeFilters(page);
    }
    await expect(page.getByTestId("map-legend")).toContainText("Suche läuft");
    release();
    await waitForSearchDone(page);
    await expect(page.getByTestId("map-legend")).toContainText(/\d+ Treffer|Keine Treffer/);
  });
  });
});
