import { expect, test } from "@playwright/test";

const receiveValues = async (page: import("@playwright/test").Page) =>
  (await page.locator("[data-testid=offer-receive]").evaluateAll((els) => els.map((e) => e.getAttribute("data-value") ?? ""))).map(Number);

test.use({ locale: "uk-UA" });

test.describe("SWAPLY demo mode", () => {
  test("home shows slogan, demo banner and needs no sign-up", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/uk$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Обмінюй вигідніше");
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    await expect(page.getByTestId("amount-input")).toHaveValue("1000");
  });

  test("main scenario: 1000 USDT TRC20 → UAH card, offers ranked by amount", async ({ page }) => {
    await page.goto("/uk");
    await page.getByTestId("search-button").click();
    await expect(page.getByTestId("offer-card").first()).toBeVisible();
    const values = await receiveValues(page);
    expect(values.length).toBeGreaterThan(0);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    await expect(page.getByTestId("offer-card").first()).toContainText("Демо-дані");
    await expect(page.getByTestId("best-receive")).not.toHaveText("—");
  });

  test("choose currencies and network, sort and filter", async ({ page }) => {
    await page.goto("/uk");
    await page.getByTestId("to-asset").click();
    await page.getByTestId("asset-option-BTC").click();
    await page.getByTestId("from-network-ETHEREUM").click();
    await expect(page.getByTestId("from-network-ETHEREUM")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("search-button").click();
    await expect(page.getByTestId("offer-card").nth(2)).toBeVisible();
    const before = await page.getByTestId("offer-card").count();

    await page.getByTestId("rate-filter-fixed").click();
    // cards animate out; wait until the exit animation has removed them
    await expect.poll(() => page.getByTestId("offer-card").count()).toBeLessThan(before);
    for (const card of await page.getByTestId("offer-card").all()) await expect(card).toContainText("Фіксований");

    await page.getByTestId("rate-filter-any").click();
    await page.getByTestId("sort-fastest").click();
    await expect(page.getByTestId("offer-card").first()).toHaveAttribute("data-provider", "demo-nova");
  });

  test("referral redirect goes to the partner link and is tracked", async ({ page }) => {
    await page.goto("/uk");
    await page.getByTestId("search-button").click();
    await page.getByTestId("offer-exchange").first().click();
    await expect(page.getByTestId("confirm-sheet")).toHaveAttribute("data-state", "ready");
    const href = await page.getByTestId("redirect-link").getAttribute("href");
    expect(href).toContain("/uk/demo-partner");
    await page.getByTestId("redirect-link").click();
    await expect(page.getByTestId("demo-partner")).toBeVisible();
  });

  test("changed rate requires explicit confirmation (mocked API)", async ({ page }) => {
    await page.goto("/uk");
    await page.getByTestId("search-button").click();
    await expect(page.getByTestId("offer-card").first()).toBeVisible();
    let calls = 0;
    await page.route("**/api/v1/referrals/redirect", async (route) => {
      calls++;
      const body = route.request().postDataJSON();
      const base = { providerId: "demo-nova", providerName: "Nova Exchange (demo)", executingPartner: null, quoteId: "newquote12345", sourceAsset: "USDT", sourceNetwork: "TRON", destinationAsset: "UAH", destinationNetwork: "CARD", sendAmount: "1000", rateType: "floating", exchangeRate: "39", knownFees: [], feesCompleteness: "unknown", minAmount: null, maxAmount: null, estimatedDuration: null, kycRequirements: "unknown", expiresAt: new Date(Date.now() + 60000).toISOString(), expiryGuaranteed: false, retrievedAt: new Date().toISOString(), executionModes: ["redirect"], providerReference: null, warnings: [], isDemo: true };
      if (!body.acceptedReceiveAmount)
        return route.fulfill({ status: 409, json: { status: "quote_changed", previous: { ...base, estimatedReceiveAmount: "40975.1" }, quote: { ...base, estimatedReceiveAmount: "39000" } } });
      expect(body.acceptedReceiveAmount).toBe("39000");
      return route.fulfill({ status: 200, json: { status: "ok", redirectUrl: "http://localhost/uk/demo-partner", clickId: "c1", quote: { ...base, estimatedReceiveAmount: "39000" }, providerName: "Nova Exchange (demo)", executingPartner: null } });
    });
    await page.getByTestId("offer-exchange").first().click();
    await expect(page.getByTestId("confirm-sheet")).toHaveAttribute("data-state", "changed");
    await expect(page.getByTestId("changed-new-amount")).toContainText("39");
    await page.getByTestId("accept-new-rate").click();
    await expect(page.getByTestId("confirm-sheet")).toHaveAttribute("data-state", "ready");
    expect(calls).toBe(2);
  });

  test("unsupported fiat route shows a clear message", async ({ page }) => {
    await page.goto("/uk");
    await page.locator("#country").selectOption("PL");
    await page.getByTestId("search-button").click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("empty-state")).toHaveAttribute("data-reason", "fiat_not_integrated");
  });

  test("amount validation", async ({ page }) => {
    await page.goto("/uk");
    await page.getByTestId("amount-input").fill("0");
    await page.getByTestId("search-button").click();
    await expect(page.getByRole("alert").first()).toContainText("більше нуля");
  });

  test("assistant fills the form from free text", async ({ page }) => {
    await page.goto("/uk");
    await page.getByTestId("assistant-open").click();
    await page.getByTestId("assistant-input").fill("700 USDT ERC20 на BTC");
    await page.getByTestId("assistant-apply").click();
    await expect(page.getByTestId("assistant-msg")).toBeVisible();
    await expect(page.getByTestId("amount-input")).toHaveValue("700");
    await expect(page.getByTestId("from-network-ETHEREUM")).toHaveAttribute("aria-checked", "true");
  });

  test("layout has no horizontal overflow and English works", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Swap smarter");
    await page.getByTestId("search-button").click();
    await expect(page.getByTestId("offer-card").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("locale detection", () => {
  test.use({ locale: "en-US" });
  test("English browsers land on /en", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
  });
});

test("admin requires authentication", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});
