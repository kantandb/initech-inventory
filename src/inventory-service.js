import { categories, itemErrors } from "./inventory.js";

export class InputError extends Error {
	constructor(message, details = [], status = 400) {
		super(message);
		this.name = "InputError";
		this.details = details;
		this.status = status;
	}
}

function integer(params, name, fallback, min, max) {
	const raw = params.get(name);
	if (raw === null) return fallback;
	if (!/^\d+$/.test(raw)) throw new InputError(`${name} must be an integer`);

	const value = Number(raw);
	if (value < min || value > max) {
		throw new InputError(`${name} must be from ${min} through ${max}`);
	}

	return value;
}

export function parseFilters(params) {
	const filters = {
		limit: integer(params, "limit", 25, 1, 25),
		cursor: params.get("cursor") || undefined,
		category: params.get("category") || undefined,
		manufacturer: params.get("manufacturer") || undefined,
		quantityMin: integer(params, "quantity_min", 0, 0, 100),
		quantityMax: integer(params, "quantity_max", 100, 0, 100),
		reserved: undefined,
		warehouse: integer(
			params,
			"warehouse",
			undefined,
			0,
			Number.MAX_SAFE_INTEGER,
		),
		aisle: params.get("aisle") || undefined,
		shelf: integer(params, "shelf", undefined, 0, Number.MAX_SAFE_INTEGER),
	};
	if (filters.category && !categories.includes(filters.category)) {
		throw new InputError("category must be a known category");
	}
	if (filters.quantityMin > filters.quantityMax) {
		throw new InputError("quantity_min must not exceed quantity_max");
	}

	const reserved = params.get("reserved");
	if (reserved !== null && reserved !== "") {
		if (reserved !== "true" && reserved !== "false") {
			throw new InputError("reserved must be true or false");
		}
		filters.reserved = reserved === "true";
	}

	return filters;
}

function matches(item, filters) {
	return (
		(!filters.category || item.category === filters.category) &&
		(!filters.manufacturer || item.manufacturer === filters.manufacturer) &&
		item.quantity >= filters.quantityMin &&
		item.quantity <= filters.quantityMax &&
		(filters.reserved === undefined || item.reserved === filters.reserved) &&
		(filters.warehouse === undefined ||
			item.location.warehouse === filters.warehouse) &&
		(!filters.aisle || item.location.aisle === filters.aisle) &&
		(filters.shelf === undefined || item.location.shelf === filters.shelf)
	);
}

function merge(target, patch) {
	if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
		return patch;
	}

	const result = { ...target };
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) {
			delete result[key];
		} else {
			result[key] = merge(result[key], value);
		}
	}

	return result;
}

export class InventoryService {
	constructor(client) {
		this.client = client;
	}

	async unique(item, currentId) {
		const errors = [];
		for (const [index, part] of item.part_numbers.entries()) {
			const result = await this.client.query({
				path: "$.part_numbers[*]",
				value: part,
				limit: 2,
			});
			if (result.documents.some((id) => id !== currentId)) {
				errors.push({
					path: `/part_numbers/${index}`,
					message: "must be globally unique",
				});
			}
		}

		return errors;
	}

	async validate(item, currentId) {
		const errors = itemErrors(item);
		if (errors.length === 0) {
			errors.push(...(await this.unique(item, currentId)));
		}
		if (errors.length > 0) {
			throw new InputError("Inventory item is invalid", errors, 422);
		}
	}

	async list(filters) {
		const items = [];
		let cursor = filters.cursor;

		do {
			const page = await this.client.list({
				index: "name",
				op: "ge",
				value: "",
				limit: filters.limit - items.length,
				cursor,
			});
			const records = await Promise.all(
				page.documents.map((id) => this.client.read(id)),
			);
			for (const record of records) {
				if (matches(record.item, filters)) {
					items.push({ ...record.item, id: record.id, etag: record.etag });
				}
			}
			cursor = page.cursor || undefined;
		} while (cursor && items.length < filters.limit);

		return { items, cursor: cursor ?? "" };
	}

	async read(id) {
		const record = await this.client.read(id);

		return { ...record.item, id: record.id, etag: record.etag };
	}

	async create(item) {
		await this.validate(item);
		const record = await this.client.create(item);

		return { ...record.item, id: record.id, etag: record.etag };
	}

	async patch(id, patch, etag) {
		const current = await this.client.read(id);
		const item = merge(current.item, patch);
		await this.validate(item, id);
		const record = await this.client.patch(id, patch, etag);

		return { ...record.item, id: record.id, etag: record.etag };
	}

	async replace(id, item, etag) {
		await this.validate(item, id);
		const record = await this.client.replace(id, item, etag);

		return { ...record.item, id: record.id, etag: record.etag };
	}

	async delete(id, etag) {
		await this.client.delete(id, etag);
	}
}
