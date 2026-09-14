import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	inventoryStats,
	readItems,
	statsArgs,
	summaryStats,
} from "../../scripts/stats.js";

let directory;

afterEach(async () => {
	if (directory) {
		await rm(directory, { recursive: true, force: true });
		directory = undefined;
	}
});

function item(name, quantity, reserved, warehouse, aisle, shelf) {
	return {
		name,
		category: "network_equipment",
		manufacturer: name === "Router" ? "Cisco" : "Nokia",
		part_numbers: [],
		quantity,
		reserved,
		location: { warehouse, aisle, shelf },
	};
}

describe("inventoryStats", () => {
	test("summarizes inventory", () => {
		const stats = inventoryStats([
			item("Router", 10, true, 1, "A", 1),
			item("Router", 20, false, 2, "B", 2),
			item("Radio", 30, false, 1, "A", 2),
		]);

		expect(stats.items).toBe(3);
		expect(stats.warehouses).toEqual([
			{
				warehouse: 1,
				items: 2,
				aisles: [
					{
						aisle: "A",
						items: 2,
						shelves: [
							{ shelf: 1, items: 1 },
							{ shelf: 2, items: 1 },
						],
					},
				],
			},
			{
				warehouse: 2,
				items: 1,
				aisles: [
					{
						aisle: "B",
						items: 1,
						shelves: [{ shelf: 2, items: 1 }],
					},
				],
			},
		]);
		expect(stats.quantity).toEqual({ min: 10, max: 30, median: 20 });
		expect(stats.reservation).toEqual({ reserved: 1, not_reserved: 2 });
		expect(stats.manufacturers).toEqual(["Cisco", "Nokia"]);
		expect(stats.repeated_items).toBe(1);
		expect(stats.repeated_records).toBe(1);
		expect(stats.categories[0]).toEqual({
			category: "network_equipment",
			items: 3,
		});
	});

	test("handles empty inventory", () => {
		const stats = inventoryStats([]);

		expect(stats.quantity).toEqual({ min: null, max: null, median: null });
		expect(stats.reservation).toEqual({ reserved: 0, not_reserved: 0 });
		expect(stats.repeated_items).toBe(0);
	});
});

test("formats compact summary output", () => {
	const stats = inventoryStats([
		item("Router", 10, true, 1, "A", 1),
		item("Router", 20, false, 2, "B", 2),
	]);

	expect(summaryStats(stats)).toBe(
		[
			"Items: 2",
			"Warehouses: 2",
			"Quantity: min 10, max 20, median 15",
			"Reserved: 1",
			"Not reserved: 1",
			"Manufacturers: 1",
			"Repeated items: 1",
			"Categories: 14",
		].join("\n"),
	);
});

test("parses output format and path flags", () => {
	expect(statsArgs([])).toEqual({
		format: "json",
		path: "fixtures/inventory.ndjson",
	});
	expect(statsArgs(["--summary", "other.ndjson"])).toEqual({
		format: "summary",
		path: "other.ndjson",
	});
	expect(() => statsArgs(["--unknown"])).toThrow("Usage:");
});

test("readItems reports malformed lines", async () => {
	directory = await mkdtemp(join(tmpdir(), "initech-stats-"));
	const path = join(directory, "inventory.ndjson");
	await Bun.write(path, '{}\n{"bad"\n');

	expect(readItems(path)).rejects.toThrow("Invalid JSON on line 2");
});
