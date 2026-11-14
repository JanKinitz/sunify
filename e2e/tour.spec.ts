// I – Einführung für Erstbesucher: Willkommen, danach Hinweise mit Pfeil auf Startort, Umkreis, Filter,
// Ergebnisse und „Meine Suchen“. Wird nur beim ersten Besuch gezeigt, über „?“ jederzeit erneut.

import { expect, test, type Page } from "@playwright/test";
import { openApp, originInput } from "./helpers";

const card = (page: Page) => page.getByTestId("tour-card");

test.describe("I Einführung", () => {
  test("I1 Erster Besuch: Willkommen und fünf Schritte mit Markierung, danach nicht mehr", async ({ page }) => {
    await openApp(page, "", { tour: true });
    await expect(page.getByRole("dialog", { name: "Willkommen bei Sunify" })).toBeVisible();
    await expect(card(page)).toContainText("Wettersuche um");
    await page.getByRole("button", { name: "Kurz zeigen, wie es geht" }).click();

    // Schritt 1 markiert das Startort-Feld
    await expect(card(page)).toContainText("Schritt 1 von 5");
    await expect(card(page)).toContainText("Startort wählen");
    // im Text steht das echte GPS-Symbol des Knopfs, keine Pinnadel
    await expect(card(page).getByTestId("tour-gps-icon")).toBeVisible();
    await expect(card(page)).not.toContainText("📍");
    const spot = await page.getByTestId("tour-spotlight").boundingBox();
    const field = await originInput(page).boundingBox();
    expect(spot && field).toBeTruthy();
    expect(spot!.x).toBeLessThanOrEqual(field!.x + 1);
    expect(spot!.y).toBeLessThanOrEqual(field!.y + 1);
    expect(spot!.x + spot!.width).toBeGreaterThanOrEqual(field!.x + field!.width - 1);

    const titles = ["Umkreis festlegen", "Wunschwetter einstellen", "Ergebnisse ansehen", "Meine Suchen"];
    for (let i = 0; i < titles.length; i++) {
      await page.getByRole("button", { name: "Weiter", exact: true }).click();
      await expect(card(page)).toContainText(`Schritt ${i + 2} von 5`);
      await expect(card(page)).toContainText(titles[i]);
      await expect(page.getByTestId("tour-spotlight")).toBeVisible();
    }
    await page.getByRole("button", { name: "Zurück", exact: true }).click();
    await expect(card(page)).toContainText("Schritt 4 von 5");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByRole("button", { name: "Los geht's" }).click();
    await expect(page.getByTestId("tour")).toHaveCount(0);

    await page.reload();
    await expect(originInput(page)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("tour")).toHaveCount(0);
  });

  test("I2 Überspringen beendet die Einführung dauerhaft, die Seite ist bedienbar", async ({ page }) => {
    await openApp(page, "", { tour: true });
    await page.getByRole("button", { name: "Überspringen" }).click();
    await expect(page.getByTestId("tour")).toHaveCount(0);
    await originInput(page).click();
    await expect(page.getByRole("button", { name: /^München/ }).first()).toBeVisible();
    await page.reload();
    await expect(originInput(page)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("tour")).toHaveCount(0);
  });

  test("I3 „?“ in der Top-Bar startet die Einführung erneut, Esc schließt sie", async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId("tour")).toHaveCount(0);
    await page.getByRole("button", { name: "Kurzanleitung" }).click();
    await expect(page.getByRole("dialog", { name: "Willkommen bei Sunify" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tour")).toHaveCount(0);
  });
});
