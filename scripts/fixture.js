import { rename } from "node:fs/promises";
import {
	categories,
	listErrors,
	manufacturerSuggestions,
} from "../src/inventory.js";

export const fixtureSeed = 0x1a17ec;
const aisles = ["A", "B", "C", "D", "E", "F", "G", "H"];
const products = {
	network_equipment: ["Router", "Switch", "Gateway"],
	radio_equipment: ["Radio", "Transceiver", "Repeater"],
	transmission_equipment: ["Multiplexer", "Transport Unit", "Amplifier"],
	fiber_optics: ["Fiber Spool", "Optical Splitter", "Patch Panel"],
	cables_and_connectors: ["Cable Assembly", "Connector Kit", "Patch Cord"],
	antennas: ["Panel Antenna", "Dish Antenna", "Antenna Mount"],
	power_equipment: ["Rectifier", "Power Supply", "Battery Unit"],
	racks_and_enclosures: ["Equipment Rack", "Wall Cabinet", "Rack Shelf"],
	customer_premises_equipment: ["Modem", "ONT", "Access Point"],
	servers_and_storage: ["Server", "Storage Array", "Drive Shelf"],
	test_equipment: ["Cable Tester", "Power Meter", "Spectrum Analyzer"],
	tools: ["Crimping Tool", "Fiber Cleaver", "Torque Wrench"],
	consumables: ["Cleaning Kit", "Cable Tie Pack", "Label Roll"],
	spare_parts: ["Fan Module", "Line Card", "Mounting Kit"],
};
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function random(seed) {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function pick(values, next) {
	return values[Math.floor(next() * values.length)];
}

function token(length, next) {
	let value = "";
	for (let index = 0; index < length; index += 1) {
		value += pick(alphabet, next);
	}

	return value;
}

function partNumber(next, used) {
	let part;
	do {
		part = `${token(4, next)}-${token(7, next)}`;
	} while (used.has(part));
	used.add(part);

	return part;
}

function partNumbers(next, used) {
	const roll = next();
	const count = roll < 0.1 ? 0 : roll < 0.8 ? 1 : 2;

	return Array.from({ length: count }, () => partNumber(next, used));
}

function itemLocation(next) {
	return {
		warehouse: 1 + Math.floor(next() * 6),
		aisle: pick(aisles, next),
		shelf: 1 + Math.floor(next() * 30),
	};
}

function shuffle(items, next) {
	for (let index = items.length - 1; index > 0; index -= 1) {
		const other = Math.floor(next() * (index + 1));
		[items[index], items[other]] = [items[other], items[index]];
	}
}

export function fixtureSize(seed = fixtureSeed) {
	return 4750 + Math.floor(random(seed ^ 0x51ae)() * 501);
}

export function makeFixture(count, seed = fixtureSeed) {
	const size = count ?? fixtureSize(seed);
	const repeatedCount = Math.round(size * 0.25);
	const uniqueCount = size - repeatedCount;
	const next = random(seed);
	const used = new Set();
	const items = [];

	for (let index = 0; index < uniqueCount; index += 1) {
		const category = pick(categories, next);
		const manufacturer = pick(manufacturerSuggestions, next);

		items.push({
			name: `${manufacturer} ${pick(products[category], next)} ${String(index + 1).padStart(4, "0")}`,
			category,
			manufacturer,
			part_numbers: partNumbers(next, used),
			quantity: Math.floor(next() * 101),
			reserved: next() < 0.2,
			location: itemLocation(next),
		});
	}

	for (let index = 0; index < repeatedCount; index += 1) {
		const source = items[index];
		const location = itemLocation(next);
		if (JSON.stringify(location) === JSON.stringify(source.location)) {
			location.shelf = (location.shelf % 30) + 1;
		}

		items.push({
			...source,
			part_numbers: partNumbers(next, used),
			quantity: (source.quantity + 1 + Math.floor(next() * 100)) % 101,
			reserved: next() < 0.2,
			location,
		});
	}

	shuffle(items, next);

	return items;
}

export async function writeFixture(
	path = "fixtures/inventory.ndjson",
	force = false,
) {
	if (!force && (await Bun.file(path).exists())) {
		return false;
	}

	const items = makeFixture();
	const errors = listErrors(items);
	if (errors.length > 0) {
		throw new Error(`Generated invalid fixture: ${JSON.stringify(errors[0])}`);
	}

	const data = `${items.map((item) => JSON.stringify(item)).join("\n")}\n`;
	const temporary = `${path}.${process.pid}.tmp`;
	await Bun.write(temporary, data);
	await rename(temporary, path);

	return true;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.some((arg) => arg !== "--force")) {
		throw new Error("Usage: bun scripts/fixture.js [--force]");
	}

	const generated = await writeFixture(
		"fixtures/inventory.ndjson",
		args.includes("--force"),
	);
	console.error(
		generated
			? "Generated fixtures/inventory.ndjson"
			: "Kept existing fixtures/inventory.ndjson",
	);
}
