import { describe, expect, test } from "bun:test";
import {
	categories,
	indexes,
	itemErrors,
	listErrors,
} from "../../src/inventory.js";

function item(overrides = {}) {
	return {
		name: "TPS Router",
		category: "network_equipment",
		manufacturer: "Initech",
		part_numbers: ["AB12-CDE3456"],
		quantity: 11,
		reserved: false,
		location: { warehouse: 13, aisle: "A", shelf: 22 },
		...overrides,
	};
}

describe("itemErrors", () => {
	test("accepts every allowed part-number count", () => {
		expect(itemErrors(item({ part_numbers: [] }))).toEqual([]);
		expect(itemErrors(item())).toEqual([]);
		expect(
			itemErrors(item({ part_numbers: ["AB12-CDE3456", "FG78-HIJ9012"] })),
		).toEqual([]);
	});

	test("requires every inventory field", () => {
		const value = item();
		for (const field of Object.keys(value)) {
			const incomplete = { ...value };
			delete incomplete[field];

			expect(itemErrors(incomplete)).toContainEqual({
				path: `/${field}`,
				message: "is required",
			});
		}
	});

	test("requires every location field", () => {
		for (const field of ["warehouse", "aisle", "shelf"]) {
			const location = { ...item().location };
			delete location[field];

			expect(itemErrors(item({ location }))).toContainEqual({
				path: `/location/${field}`,
				message: "is required",
			});
		}
	});

	test("enforces quantity boundaries", () => {
		expect(itemErrors(item({ quantity: 0 }))).toEqual([]);
		expect(itemErrors(item({ quantity: 100 }))).toEqual([]);

		for (const quantity of [-1, 1.5, 101]) {
			expect(itemErrors(item({ quantity }))).toContainEqual({
				path: "/quantity",
				message: "must be an integer from 0 through 100",
			});
		}
	});

	test("validates category and field types", () => {
		const errors = itemErrors(
			item({
				name: 1,
				category: "furniture",
				manufacturer: false,
				reserved: "no",
				location: { warehouse: "13", aisle: 1, shelf: "22" },
			}),
		);

		expect(errors.map(({ path }) => path)).toEqual([
			"/name",
			"/category",
			"/manufacturer",
			"/reserved",
			"/location/warehouse",
			"/location/aisle",
			"/location/shelf",
		]);
	});

	test("validates part-number format and count", () => {
		const errors = itemErrors(
			item({ part_numbers: ["bad", "FG78-HIJ9012", "KL34-MNO5678"] }),
		);

		expect(errors).toContainEqual({
			path: "/part_numbers",
			message: "must contain at most two values",
		});
		expect(errors).toContainEqual({
			path: "/part_numbers/0",
			message: "must match XXXX-XXXXXXX",
		});
	});

	test("rejects duplicate part numbers within an item", () => {
		const errors = itemErrors(
			item({ part_numbers: ["AB12-CDE3456", "AB12-CDE3456"] }),
		);

		expect(errors).toContainEqual({
			path: "/part_numbers/1",
			message: "must be globally unique",
		});
	});
});

describe("listErrors", () => {
	test("rejects duplicate part numbers across inventory", () => {
		const errors = listErrors([item(), item({ name: "TPS Switch" })]);

		expect(errors).toContainEqual({
			path: "/1/part_numbers/0",
			message: "must be globally unique",
		});
	});
});

test("defines categories and indexes", () => {
	expect(categories).toHaveLength(14);
	expect(indexes).toEqual([
		{ name: "name", path: "/name" },
		{ name: "category", path: "/category" },
		{ name: "manufacturer", path: "/manufacturer" },
		{ name: "quantity", path: "/quantity" },
		{ name: "reserved", path: "/reserved" },
		{ name: "warehouse", path: "/location/warehouse" },
		{ name: "aisle", path: "/location/aisle" },
		{ name: "shelf", path: "/location/shelf" },
	]);
});
