import { describe, expect, test } from "bun:test";
import {
	InputError,
	InventoryService,
	parseFilters,
} from "../../src/inventory-service.js";

function item(overrides = {}) {
	return {
		name: "Router",
		category: "network_equipment",
		manufacturer: "Initech",
		part_numbers: [],
		quantity: 10,
		reserved: false,
		location: { warehouse: 1, aisle: "A", shelf: 1 },
		...overrides,
	};
}

describe("parseFilters", () => {
	test("parses filters and pagination", () => {
		const params = new URLSearchParams({
			limit: "10",
			category: "network_equipment",
			quantity_min: "5",
			quantity_max: "20",
			reserved: "true",
			warehouse: "2",
			aisle: "B",
			shelf: "3",
		});

		expect(parseFilters(params)).toEqual({
			limit: 10,
			cursor: undefined,
			category: "network_equipment",
			manufacturer: undefined,
			quantityMin: 5,
			quantityMax: 20,
			reserved: true,
			warehouse: 2,
			aisle: "B",
			shelf: 3,
		});
	});

	test("rejects invalid ranges and page sizes", () => {
		expect(() => parseFilters(new URLSearchParams({ limit: "26" }))).toThrow(
			InputError,
		);
		expect(() =>
			parseFilters(
				new URLSearchParams({ quantity_min: "20", quantity_max: "10" }),
			),
		).toThrow("quantity_min must not exceed quantity_max");
	});
});

describe("InventoryService", () => {
	test("hydrates, filters, and paginates items in name order", async () => {
		const limits = [];
		const pages = [
			{ documents: ["a", "b"], cursor: "next" },
			{ documents: ["c"], cursor: "after" },
		];
		const records = {
			a: item({ name: "Alpha", quantity: 1 }),
			b: item({ name: "Beta", quantity: 10 }),
			c: item({ name: "Charlie", quantity: 15 }),
		};
		const client = {
			list(options) {
				limits.push(options.limit);

				return Promise.resolve(pages.shift());
			},
			read(id) {
				return Promise.resolve({ id, etag: `"${id}"`, item: records[id] });
			},
		};
		const service = new InventoryService(client);
		const filters = parseFilters(
			new URLSearchParams({ limit: "2", quantity_min: "5" }),
		);

		expect(await service.list(filters)).toEqual({
			items: [
				{ ...records.b, id: "b", etag: '"b"' },
				{ ...records.c, id: "c", etag: '"c"' },
			],
			cursor: "after",
		});
		expect(limits).toEqual([2, 1]);
	});

	test("rejects part numbers already used by another item", async () => {
		const client = {
			query() {
				return Promise.resolve({ documents: ["existing"], cursor: "" });
			},
		};
		const service = new InventoryService(client);

		expect(
			service.validate(item({ part_numbers: ["AB12-CDE3456"] })),
		).rejects.toEqual(
			expect.objectContaining({
				name: "InputError",
				details: [
					{
						path: "/part_numbers/0",
						message: "must be globally unique",
					},
				],
			}),
		);
	});

	test("validates a merged patch before mutation", async () => {
		const calls = [];
		const client = {
			read() {
				return Promise.resolve({ id: "id", etag: '"old"', item: item() });
			},
			patch(id, patch, etag) {
				calls.push({ id, patch, etag });

				return Promise.resolve({
					id,
					etag: '"new"',
					item: item({ quantity: patch.quantity }),
				});
			},
		};
		const service = new InventoryService(client);

		expect(await service.patch("id", { quantity: 20 }, '"old"')).toEqual({
			...item({ quantity: 20 }),
			id: "id",
			etag: '"new"',
		});
		expect(calls).toEqual([
			{ id: "id", patch: { quantity: 20 }, etag: '"old"' },
		]);
	});
});
