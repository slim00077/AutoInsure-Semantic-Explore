import { test, expect } from "@playwright/test";

test("la pile isolée démarre et le dashboard s'affiche", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText("Triple store connecté")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "screenshots/00-dashboard.png", fullPage: true });
});
