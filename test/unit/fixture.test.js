import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	fixtureSeed,
	fixtureSize,
	makeFixture,
	writeFixture,
} from "../../scripts/fixture.js";
import { inventoryStats } from "../../scripts/stats.js";
import { categories, listErrors } from "../../src/inventory.js";

let directory;

afterEach(async () => {
	if (directory) {
		await rm(directory, { recursive: true, force: true });
		directory = undefined;
	}
});

async function target() {
	directory = await mkdtemp(join(tmpdir(), "initech-fixture-"));

	return join(directory, "inventory.ndjson");
}

describe("makeFixture", () => {
	test("generates a deterministic valid size within five percent", () => {
		const items = makeFixture();

		expect(items.length).toBeGreaterThanOrEqual(4750);
		expect(items.length).toBeLessThanOrEqual(5250);
		expect(items).toHaveLength(fixtureSize());
		expect(listErrors(items)).toEqual([]);
		expect(items).toEqual(makeFixture(undefined, fixtureSeed));
	});

	test("makes about 25 percent of records repeats", () => {
		const items = makeFixture();
		const stats = inventoryStats(items);

		expect(stats.repeated_records / items.length).toBeCloseTo(0.25, 3);
	});

	test("varies and naturally repeats inventory values", () => {
		const items = makeFixture();
		const counts = new Set(items.map((item) => item.part_numbers.length));

		expect(new Set(items.map((item) => item.category))).toEqual(
			new Set(categories),
		);
		expect(
			new Set(items.map((item) => item.manufacturer)).size,
		).toBeGreaterThan(1);
		expect(new Set(items.map((item) => item.location.warehouse)).size).toBe(6);
		expect(new Set(items.map((item) => item.location.aisle)).size).toBe(8);
		expect(new Set(items.map((item) => item.location.shelf)).size).toBe(30);
		expect(counts).toEqual(new Set([0, 1, 2]));
		expect(items.some((item) => item.reserved)).toBe(true);
		expect(items.some((item) => !item.reserved)).toBe(true);
	});
});

describe("writeFixture", () => {
	test("writes one JSON document per line", async () => {
		const path = await target();

		expect(await writeFixture(path)).toBe(true);
		const lines = (await Bun.file(path).text()).trimEnd().split("\n");
		expect(lines).toHaveLength(fixtureSize());
		expect(listErrors(lines.map((line) => JSON.parse(line)))).toEqual([]);
	});

	test("keeps an existing fixture unless forced", async () => {
		const path = await target();
		await Bun.write(path, "existing\n");

		expect(await writeFixture(path)).toBe(false);
		expect(await Bun.file(path).text()).toBe("existing\n");
		expect(await writeFixture(path, true)).toBe(true);
		expect((await Bun.file(path).text()).startsWith("existing")).toBe(false);
	});
});
