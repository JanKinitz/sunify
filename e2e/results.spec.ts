// C – Ergebnisse, Detailansicht, Merkliste, Teilen (siehe e2e/TESTFAELLE.md)
import { expect, test } from "@playwright/test";
import { BROAD_SEARCH, IMPOSSIBLE_SEARCH, isMobile, nextSearch, openApp, openResults, originInput, waitForSearchDone } from "./helpers";

test.describe("C Ergebnisse", () => {
  test("C1 Ergebnisliste mit Karten und Sortierung", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const list = await openResults(page);
    const cards = list.getByTestId("result-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(2);
    await expect(cards.first()).toContainText(/°C/);

    const sort = list.getByRole("combobox", { name: "Sortieren nach" });
    await sort.selectOption("distance");
    await expect(sort).toHaveValue("distance");
  });

  test("C2 Detailansicht: Wetter-Timeline, Buchungslink, Schließen", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const list = await openResults(page);
    const card = list.getByTestId("result-card").first();
    const name = (await card.locator("h3").first().textContent())?.trim() ?? "";
    await card.getByRole("button", { name: /Details & Unterkünfte/ }).click();

    const dialog = page.getByRole("dialog", { name: /Details zu/ });
    await expect(dialog).toBeVisible();
    if (name) await expect(dialog).toContainText(name);
    await expect(dialog.getByText("Wetter-Timeline")).toBeVisible();
    const booking = dialog.getByRole("link", { name: /Booking\.com/ });
    await expect(booking).toHaveAttribute("href", /checkin=\d{4}-\d{2}-\d{2}.*checkout=\d{4}-\d{2}-\d{2}/);
    await expect(dialog.getByRole("link", { name: /Google Maps/ })).toHaveAttribute("href", /google\.com\/maps/);

    if (isMobile(page)) await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
    else await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("C3 Merkliste: merken, anzeigen, bleibt nach Neuladen", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const list = await openResults(page);
    const heart = list.getByTestId("result-card").first().getByRole("button", { name: / merken$/ });
    const label = (await heart.getAttribute("aria-label")) ?? "";
    const name = label.replace(/ merken$/, "");
    await heart.click();
    await expect(page.getByRole("status")).toContainText("gemerkt");

    await page.reload();
    await waitForSearchDone(page);
    await page.getByTitle("Merkliste öffnen").click();
    const drawer = page.getByRole("dialog", { name: "Merkliste" });
    await expect(drawer).toContainText(name);
    await drawer.getByRole("button", { name: `${name} entfernen` }).click();
    await expect(drawer).toContainText("Noch nichts gemerkt");
  });

  test("C4 Keine Treffer: hilfreicher Leerzustand statt leerer Seite", async ({ page }) => {
    await openApp(page, IMPOSSIBLE_SEARCH);
    await waitForSearchDone(page);
    const list = await openResults(page);
    const empty = list.getByTestId("empty-state");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("Hier versteckt sich die Sonne noch");
    await expect(empty.getByRole("button", { name: /Alle Filter zurücksetzen/ })).toBeVisible();
  });

  test("C5 Suche teilen kopiert den Link", async ({ page, context, browserName }) => {
    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    await page.getByTitle("Suchergebnis teilen").click();
    await expect(page.getByRole("status")).toContainText(/Link/);
  });

  test("C6 Geteilter Link stellt Startort und Filter wieder her", async ({ page }) => {
    const searched = nextSearch(page);
    await openApp(page, "o=frankfurt&r=150&d=nextWeekend&t=8&p=almost&w=40&sun=2&c=all&tol=1");
    const body = (await searched).request().postDataJSON();
    expect(body.radiusKm).toBe(150);
    expect(body.tolerance).toBe(1);
    expect(body.criteria.minTempMax).toBe(8);
    await expect(originInput(page)).toHaveValue("Frankfurt am Main");
  });
});
