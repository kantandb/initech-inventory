import { expect, test } from "@playwright/test";

test("runs the main inventory workflow", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByText("Alpha Router", { exact: true })).toBeVisible();

	const filters = page.locator(".filters");
	await filters.getByLabel("Manufacturer").fill("Unknown Manufacturer");
	await filters.getByRole("button", { name: "Apply filter" }).click();
	await expect(page.getByText("No inventory found")).toBeVisible();
	await filters.getByRole("button", { name: "Reset filter" }).click();
	await expect(page.getByText("Alpha Router", { exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Add item" }).click();
	const modal = page.getByRole("dialog");
	await modal.getByLabel("Name").fill("Smoke Test Router");
	await modal.getByLabel("Category").selectOption("network_equipment");
	await modal.getByLabel("Manufacturer").fill("Initech");
	await modal.getByLabel("Quantity").fill("12");
	await modal.getByLabel("Warehouse").fill("3");
	await modal.getByLabel("Aisle").fill("C");
	await modal.getByLabel("Shelf").fill("4");
	await modal.getByRole("button", { name: "Save item" }).click();

	const card = page.locator(".item-card", { hasText: "Smoke Test Router" });
	await expect(card).toBeVisible();
	await card.getByRole("button", { name: "Edit item" }).click();
	await page.getByRole("dialog").getByLabel("Quantity").fill("13");
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Save item" })
		.click();
	await expect(card.locator(".quantity")).toHaveText("13");

	await card.getByRole("button", { name: "Increase quantity" }).click();
	await expect(card.locator(".quantity")).toHaveText("14");
	await card.getByLabel("Reserved").check();
	await expect(card.getByLabel("Reserved")).toBeChecked();

	page.once("dialog", (dialog) => dialog.accept());
	await card.getByRole("button", { name: "Delete item" }).click();
	await expect(card).toHaveCount(0);
});
