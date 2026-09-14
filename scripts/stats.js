import { categories } from "../src/inventory.js";

function byValue(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function locationKey(location) {
	return JSON.stringify([location.warehouse, location.aisle, location.shelf]);
}

function itemKey(item) {
	return JSON.stringify([item.name, item.category, item.manufacturer]);
}

function median(values) {
	if (values.length === 0) {
		return null;
	}

	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

export async function readItems(path = "fixtures/inventory.ndjson") {
	const lines = (await Bun.file(path).text()).split("\n");
	const items = [];

	for (const [index, line] of lines.entries()) {
		if (line.trim() === "") {
			continue;
		}

		try {
			items.push(JSON.parse(line));
		} catch (error) {
			throw new Error(`Invalid JSON on line ${index + 1}`, { cause: error });
		}
	}

	return items;
}

export function inventoryStats(items) {
	const warehouseMap = new Map();
	const manufacturerSet = new Set();
	const categoryCounts = new Map(categories.map((category) => [category, 0]));
	const itemGroups = new Map();
	let reserved = 0;

	for (const item of items) {
		manufacturerSet.add(item.manufacturer);
		categoryCounts.set(
			item.category,
			(categoryCounts.get(item.category) ?? 0) + 1,
		);
		reserved += Number(item.reserved);

		let warehouse = warehouseMap.get(item.location.warehouse);
		if (!warehouse) {
			warehouse = { items: 0, aisles: new Map() };
			warehouseMap.set(item.location.warehouse, warehouse);
		}
		warehouse.items += 1;

		let aisle = warehouse.aisles.get(item.location.aisle);
		if (!aisle) {
			aisle = { items: 0, shelves: new Map() };
			warehouse.aisles.set(item.location.aisle, aisle);
		}
		aisle.items += 1;
		aisle.shelves.set(
			item.location.shelf,
			(aisle.shelves.get(item.location.shelf) ?? 0) + 1,
		);

		const key = itemKey(item);
		let group = itemGroups.get(key);
		if (!group) {
			group = { records: 0, quantities: new Set(), locations: new Set() };
			itemGroups.set(key, group);
		}
		group.records += 1;
		group.quantities.add(item.quantity);
		group.locations.add(locationKey(item.location));
	}

	const warehouses = [...warehouseMap]
		.sort(([left], [right]) => byValue(left, right))
		.map(([warehouse, value]) => ({
			warehouse,
			items: value.items,
			aisles: [...value.aisles]
				.sort(([left], [right]) => byValue(left, right))
				.map(([aisle, aisleValue]) => ({
					aisle,
					items: aisleValue.items,
					shelves: [...aisleValue.shelves]
						.sort(([left], [right]) => byValue(left, right))
						.map(([shelf, count]) => ({ shelf, items: count })),
				})),
		}));
	const repeated = [...itemGroups.values()].filter(
		(group) => group.quantities.size > 1 && group.locations.size > 1,
	);
	const quantities = items.map((item) => item.quantity);

	return {
		items: items.length,
		warehouses,
		quantity: {
			min: quantities.length > 0 ? Math.min(...quantities) : null,
			max: quantities.length > 0 ? Math.max(...quantities) : null,
			median: median(quantities),
		},
		reservation: {
			reserved,
			not_reserved: items.length - reserved,
		},
		manufacturers: [...manufacturerSet].sort(byValue),
		repeated_items: repeated.length,
		repeated_records: repeated.reduce(
			(total, group) => total + group.records - 1,
			0,
		),
		categories: [...categoryCounts].map(([category, count]) => ({
			category,
			items: count,
		})),
	};
}

export function summaryStats(stats) {
	return [
		`Items: ${stats.items}`,
		`Warehouses: ${stats.warehouses.length}`,
		`Quantity: min ${stats.quantity.min}, max ${stats.quantity.max}, median ${stats.quantity.median}`,
		`Reserved: ${stats.reservation.reserved}`,
		`Not reserved: ${stats.reservation.not_reserved}`,
		`Manufacturers: ${stats.manufacturers.length}`,
		`Repeated items: ${stats.repeated_records}`,
		`Categories: ${stats.categories.length}`,
	].join("\n");
}

export function statsArgs(args) {
	let format = "json";
	let path = "fixtures/inventory.ndjson";
	let hasPath = false;

	for (const arg of args) {
		if (arg === "--summary" || arg === "--json") {
			format = arg.slice(2);
		} else if (arg.startsWith("-") || hasPath) {
			throw new Error("Usage: bun scripts/stats.js [--summary|--json] [path]");
		} else {
			path = arg;
			hasPath = true;
		}
	}

	return { format, path };
}

if (import.meta.main) {
	const { format, path } = statsArgs(process.argv.slice(2));
	const stats = inventoryStats(await readItems(path));
	console.log(
		format === "summary" ? summaryStats(stats) : JSON.stringify(stats, null, 2),
	);
}
