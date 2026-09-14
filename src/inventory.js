export const categories = Object.freeze([
	"network_equipment",
	"radio_equipment",
	"transmission_equipment",
	"fiber_optics",
	"cables_and_connectors",
	"antennas",
	"power_equipment",
	"racks_and_enclosures",
	"customer_premises_equipment",
	"servers_and_storage",
	"test_equipment",
	"tools",
	"consumables",
	"spare_parts",
]);

export const indexes = Object.freeze([
	{ name: "name", path: "/name" },
	{ name: "category", path: "/category" },
	{ name: "manufacturer", path: "/manufacturer" },
	{ name: "quantity", path: "/quantity" },
	{ name: "reserved", path: "/reserved" },
	{ name: "warehouse", path: "/location/warehouse" },
	{ name: "aisle", path: "/location/aisle" },
	{ name: "shelf", path: "/location/shelf" },
]);

const fields = [
	"name",
	"category",
	"manufacturer",
	"part_numbers",
	"quantity",
	"reserved",
	"location",
];
const locationFields = ["warehouse", "aisle", "shelf"];
const partPattern = /^[A-Z0-9]{4}-[A-Z0-9]{7}$/;

function issue(path, message) {
	return { path, message };
}

function object(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function itemErrors(item, used = new Set()) {
	if (!object(item)) {
		return [issue("/", "must be an object")];
	}

	const errors = [];
	for (const field of fields) {
		if (!Object.hasOwn(item, field)) {
			errors.push(issue(`/${field}`, "is required"));
		}
	}

	if (Object.hasOwn(item, "name") && typeof item.name !== "string") {
		errors.push(issue("/name", "must be a string"));
	}
	if (Object.hasOwn(item, "category") && !categories.includes(item.category)) {
		errors.push(issue("/category", "must be a known category"));
	}
	if (
		Object.hasOwn(item, "manufacturer") &&
		typeof item.manufacturer !== "string"
	) {
		errors.push(issue("/manufacturer", "must be a string"));
	}

	if (Object.hasOwn(item, "part_numbers")) {
		if (!Array.isArray(item.part_numbers)) {
			errors.push(issue("/part_numbers", "must be an array"));
		} else {
			if (item.part_numbers.length > 2) {
				errors.push(issue("/part_numbers", "must contain at most two values"));
			}

			const local = new Set();
			for (const [index, part] of item.part_numbers.entries()) {
				const path = `/part_numbers/${index}`;
				if (typeof part !== "string" || !partPattern.test(part)) {
					errors.push(issue(path, "must match XXXX-XXXXXXX"));
				} else if (local.has(part) || used.has(part)) {
					errors.push(issue(path, "must be globally unique"));
				}
				local.add(part);
			}
		}
	}

	if (
		Object.hasOwn(item, "quantity") &&
		(!Number.isInteger(item.quantity) ||
			item.quantity < 0 ||
			item.quantity > 100)
	) {
		errors.push(issue("/quantity", "must be an integer from 0 through 100"));
	}
	if (Object.hasOwn(item, "reserved") && typeof item.reserved !== "boolean") {
		errors.push(issue("/reserved", "must be a boolean"));
	}

	if (Object.hasOwn(item, "location")) {
		if (!object(item.location)) {
			errors.push(issue("/location", "must be an object"));
		} else {
			for (const field of locationFields) {
				if (!Object.hasOwn(item.location, field)) {
					errors.push(issue(`/location/${field}`, "is required"));
				}
			}
			if (
				Object.hasOwn(item.location, "warehouse") &&
				!Number.isInteger(item.location.warehouse)
			) {
				errors.push(issue("/location/warehouse", "must be an integer"));
			}
			if (
				Object.hasOwn(item.location, "aisle") &&
				typeof item.location.aisle !== "string"
			) {
				errors.push(issue("/location/aisle", "must be a string"));
			}
			if (
				Object.hasOwn(item.location, "shelf") &&
				!Number.isInteger(item.location.shelf)
			) {
				errors.push(issue("/location/shelf", "must be an integer"));
			}
		}
	}

	return errors;
}

export function listErrors(items) {
	if (!Array.isArray(items)) {
		return [issue("/", "must be an array")];
	}

	const errors = [];
	const used = new Set();
	for (const [index, item] of items.entries()) {
		for (const error of itemErrors(item, used)) {
			errors.push({ ...error, path: `/${index}${error.path}` });
		}

		if (Array.isArray(item?.part_numbers)) {
			for (const part of item.part_numbers) {
				if (typeof part === "string" && partPattern.test(part)) {
					used.add(part);
				}
			}
		}
	}

	return errors;
}
