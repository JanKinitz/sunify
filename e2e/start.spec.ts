// A – Startbildschirm, Startort und Umkreis (siehe e2e/TESTFAELLE.md)
import { expect, test } from "@playwright/test";
import { chooseOrigin, chooseRadius, isMobile, nextSearch, openApp, openFilters, openResults, originInput, waitForSearchDone } from "./helpers";

test.describe("A Start", () => {
  test("A1 Startseite lädt leer: kein Startort, keine Suche, Regler auf „Egal“", async ({ page }) => {
    const searches: string[] = [];
    page.on("request", (r) => r.url().includes("/api/search") && searches.push(r.url()));
    await openApp(page);

    await expect(originInput(page)).toHaveValue("");
    await expect(originInput(page)).toHaveAttribute("placeholder", /Startort/);
    await expect(page.getByTestId("map-legend")).toContainText("Startort wählen");
    const list = await openResults(page);
    await expect(list.getByTestId("welcome")).toBeVisible();
    if (isMobile(page)) await page.getByTestId("show-map").click();

    const filters = await openFilters(page);
    await expect(filters.getByText("Egal").first()).toBeVisible();
    await expect(filters.getByRole("radio", { name: "Egal" })).toHaveAttribute("aria-checked", "true");

    await page.waitForTimeout(1500);
    expect(searches, "ohne Startort darf nicht gesucht werden").toHaveLength(0);
  });

  test("A2 Startort aus Vorschlägen wählen startet die Suche", async ({ page }) => {
    await openApp(page);
    await chooseOrigin(page, "München");
    await expect(originInput(page)).toHaveValue("München");
    await expect(page).toHaveURL(/o=muenchen/);
    await expect(page.getByTestId("map-legend")).toContainText(/\d+ Treffer|Keine Treffer/);
    await expect(page.locator(".sunify-origin")).toBeVisible();
  });

  test("A3 Umkreis ändern sucht neu und steht im Link", async ({ page }) => {
    await openApp(page);
    await chooseOrigin(page);
    const searched = nextSearch(page);
    await chooseRadius(page, 100);
    const res = await searched;
    expect(res.ok()).toBeTruthy();
    expect(res.request().postDataJSON().radiusKm).toBe(100);
    await waitForSearchDone(page);
    await expect(page).toHaveURL(/r=100/);
  });

  test("A4 GPS-Standort übernehmen", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 47.6633, longitude: 9.1757 }); // Konstanz
    await openApp(page);
    const searched = nextSearch(page);
    await page.getByRole("button", { name: /GPS-Standort nutzen/ }).click();
    await searched;
    await expect(originInput(page)).toHaveValue("Mein Standort");
    await expect(page).toHaveURL(/lat=47\.66&lon=9\.18/);
  });

  test("A5 Beliebiger Ort weltweit über die Ortssuche (Christchurch)", async ({ page }) => {
    test.slow();
    await openApp(page);
    await originInput(page).fill("Christchurch");
    const option = page.getByRole("button", { name: /Christchurch/ }).first();
    await expect(option).toBeVisible({ timeout: 20_000 });
    const searched = nextSearch(page);
    await option.click();
    await searched;
    await waitForSearchDone(page);
    await expect(page).toHaveURL(/n=Christchurch/);
    // Alle Wetter-Regler stehen auf „egal“: in 200 km um Christchurch muss es Orte mit Prognose geben
    await expect(page.getByTestId("map-legend")).toContainText(/\d+ Treffer/);
  });
});
