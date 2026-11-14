// H – „Meine Suchen“: eigene Vorlagen mit Startort, Umkreis und Filtern (ohne Zeitraum), nur im Browser gespeichert.

import { expect, test, type Page } from "@playwright/test";
import { BROAD_SEARCH, openApp, openResults, originInput, waitForSearchDone } from "./helpers";

const NAME = "Testsuche Berg";

async function openPresets(page: Page) {
  await page.getByTestId("presets-button").click();
  const menu = page.getByRole("dialog", { name: "Meine Suchen" });
  await expect(menu).toBeVisible();
  return menu;
}

/** Aktuelle Suche unter `name` speichern; das Menü bleibt offen */
async function savePreset(page: Page, name = NAME) {
  const menu = await openPresets(page);
  await menu.locator("#sunify-preset-name").fill(name);
  await menu.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(`„${name}“ gespeichert`);
  await expect(menu.getByTestId("preset-item").filter({ hasText: name })).toBeVisible();
  return menu;
}

test.describe("H Meine Suchen", () => {
  test("H1 Aktuelle Suche speichern, bleibt nach Neuladen und wird als aktiv erkannt", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    await expect(page.getByTestId("presets-button")).toHaveAttribute("data-active", "false");
    await savePreset(page);
    await expect(page.getByTestId("presets-button")).toHaveAttribute("data-active", "true");

    await page.reload();
    await waitForSearchDone(page);
    await expect(page.getByTestId("presets-button")).toHaveAttribute("data-active", "true");
    const menu = await openPresets(page);
    await expect(menu.getByTestId("preset-item")).toHaveCount(1);
    await expect(menu.getByTestId("preset-item")).toContainText("München");
  });

  test("H2 Vorlage laden setzt Startort, Umkreis und Filter, der Zeitraum bleibt", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const menu = await savePreset(page);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await openApp(page, "o=berlin&r=100&d=tomorrow&t=10&p=dry&w=30&sun=2&c=water");
    await waitForSearchDone(page);
    const again = await openPresets(page);
    await again.getByRole("button", { name: `Suche „${NAME}“ laden` }).click();
    await expect(again).toBeHidden();
    await expect(originInput(page)).toHaveValue("München");
    await expect(page.getByTitle("Suchradius")).toHaveValue("300");
    await expect(page).toHaveURL(/d=tomorrow/);
    await expect(page).toHaveURL(/t=-5/);
    await expect(page).toHaveURL(/p=any/);
    await expect(page).toHaveURL(/c=all/);
    await waitForSearchDone(page);
    await expect(page.getByTestId("presets-button")).toHaveAttribute("data-active", "true");
  });

  test("H3 Start-Vorlage wird beim Öffnen geladen, ein geteilter Link hat Vorrang", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const menu = await savePreset(page);
    const star = menu.getByRole("button", { name: `„${NAME}“ beim Start laden` });
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");

    await openApp(page);
    await expect(originInput(page)).toHaveValue("München");
    await expect(page).toHaveURL(/o=muenchen/);
    await expect(page).toHaveURL(/r=300/);
    await waitForSearchDone(page);

    await openApp(page, "o=berlin&r=100&d=tomorrow");
    await expect(originInput(page)).toHaveValue("Berlin");
    await expect(page).toHaveURL(/r=100/);
  });

  test("H4 Vorlage löschen mit Rückfrage", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    const menu = await savePreset(page);
    await menu.getByRole("button", { name: `„${NAME}“ löschen` }).click();
    await expect(menu).toContainText(`„${NAME}“ löschen?`);
    await menu.getByRole("button", { name: "Abbrechen" }).click();
    await expect(menu.getByTestId("preset-item")).toHaveCount(1);
    await menu.getByRole("button", { name: `„${NAME}“ löschen` }).click();
    await menu.getByRole("button", { name: "Löschen", exact: true }).click();
    await expect(menu.getByTestId("preset-item")).toHaveCount(0);
    await expect(menu).toContainText("Speichere Startort, Umkreis und Wunschwetter");
  });

  test("H5 Ohne Startort: gespeicherte Suchen als Schnellwahl auf der Startseite", async ({ page }) => {
    await openApp(page, BROAD_SEARCH);
    await waitForSearchDone(page);
    await savePreset(page);
    await page.keyboard.press("Escape");

    await openApp(page);
    await expect(originInput(page)).toHaveValue("");
    const area = await openResults(page);
    const quick = area.getByTestId("welcome-presets");
    await expect(quick).toBeVisible();
    await quick.getByRole("button", { name: new RegExp(NAME) }).click();
    await expect(originInput(page)).toHaveValue("München");
    await waitForSearchDone(page);
  });
});
