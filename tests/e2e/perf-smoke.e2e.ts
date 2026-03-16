import { expect, test, type Page } from "@playwright/test";

const MAX_ROUTE_LOAD_MS = Number(process.env["E2E_PERF_MAX_ROUTE_MS"] ?? "4500");

const loadRoute = async (page: Page, path: string): Promise<number> => {
  const started = Date.now();
  const response = await page.goto(path);
  expect(response?.status()).toBeGreaterThanOrEqual(200);
  await expect(page.locator("main")).toBeVisible();
  return Date.now() - started;
};

test("@perf route load smoke", async ({ page }) => {
  const setupLoadMs = await loadRoute(page, "/setup");
  expect(setupLoadMs).toBeLessThan(MAX_ROUTE_LOAD_MS);

  const loginLoadMs = await loadRoute(page, "/login");
  expect(loginLoadMs).toBeLessThan(MAX_ROUTE_LOAD_MS);
});
