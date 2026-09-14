import { describe, expect, test } from "bun:test";
import { createUi, renderCard, renderResults, sse } from "../../src/ui.js";

function item(overrides = {}) {
	return {
		id: "item-id",
		etag: '"00000000000000000000000000000000"',
		name: "TPS Router",
		category: "network_equipment",
		manufacturer: "Initech",
		part_numbers: ["AB12-CDE3456"],
		quantity: 10,
		reserved: false,
		location: { warehouse: 1, aisle: "A", shelf: 1 },
		...overrides,
	};
}

function client(records = { "item-id": item() }) {
	return {
		list() {
			return Promise.resolve({ documents: Object.keys(records), cursor: "" });
		},
		read(id) {
			const { etag, ...value } = records[id];
			delete value.id;

			return Promise.resolve({ id, etag, item: value });
		},
	};
}

describe("rendering", () => {
	test("renders complete inventory cards and actions", () => {
		const html = renderCard(item());

		expect(html).toContain("TPS Router");
		expect(html).toContain("AB12-CDE3456");
		expect(html).toContain("Warehouse 1, aisle A, shelf 1");
		expect(html).toContain("/quantity");
		expect(html).toContain("payload: {category: $category");
		expect(html).toContain('aria-label="Edit item"');
		expect(html).toContain('aria-label="Delete item"');
		expect(html).toContain("confirm('Delete this item?')");
	});

	test("renders empty and pagination states", () => {
		expect(renderResults({ items: [], cursor: "" })).toContain(
			"No inventory found",
		);
		expect(renderResults({ items: [item()], cursor: "next" })).toContain(
			"cursor=next",
		);
	});
});

describe("UI routes", () => {
	test("serves the initial page with vendored Datastar", async () => {
		const ui = createUi(client());
		const response = await ui(new Request("http://app/"));
		const html = await response.text();

		expect(response.headers.get("content-type")).toContain("text/html");
		expect(html).toContain('<script type="module" src="/datastar.js">');
		expect(html).toContain("TPS Router");
		expect(html).toContain('aria-label="Add item"');
		expect(html).toContain('<svg viewBox="0 0 24 24"');
		expect(html).toContain('list="manufacturer-options"');
		expect(html).toContain('<option value="Cisco"></option>');
		expect(html).toContain('aria-label="Minimum quantity" type="number"');
		expect(html).toContain("data-bind:draft_quantity_min");
		expect(html).toContain("data-bind:draft_quantity_max");
		expect(html).toContain("Apply filter");
		expect(html).toContain("Reset filter");
		expect(html).toContain(
			"<label>Category<select data-bind:draft_category><option",
		);
	});

	test("returns Datastar patches for filters and modals", async () => {
		const ui = createUi(client());
		const signals = encodeURIComponent(
			JSON.stringify({ quantityMin: 20, quantityMax: 30 }),
		);
		const filtered = await ui(
			new Request(`http://app/ui/items?datastar=${signals}`),
		);
		const modal = await ui(new Request("http://app/ui/items/new"));
		const closed = await ui(new Request("http://app/ui/modal/close"));

		expect(filtered.headers.get("content-type")).toBe("text/event-stream");
		expect(await filtered.text()).toContain("No inventory found");
		expect(await modal.text()).toContain("Add item");
		expect(await closed.text()).toContain(
			'data: elements <div id="modal-root"></div>',
		);
	});

	test("removes quantity changes that no longer match filters", async () => {
		let record = item();
		const database = {
			list() {
				return Promise.resolve({ documents: [record.id], cursor: "" });
			},
			read(id) {
				const { etag, ...value } = record;
				delete value.id;

				return Promise.resolve({ id, etag, item: value });
			},
			query() {
				return Promise.resolve({ documents: [record.id], cursor: "" });
			},
			patch(id, patch) {
				record = { ...record, ...patch, etag: '"new"' };

				return Promise.resolve({ id, etag: record.etag, item: record });
			},
		};
		const ui = createUi(database);
		const response = await ui(
			new Request("http://app/ui/items/item-id/quantity?delta=-1", {
				method: "PATCH",
				headers: {
					"content-type": "application/json",
					"if-match": record.etag,
				},
				body: JSON.stringify({ quantity_min: 10, quantity_max: 10 }),
			}),
		);
		const body = await response.text();

		expect(record.quantity).toBe(9);
		expect(body).toContain("No inventory found");
		expect(body).not.toContain('id="item-item-id"');
	});
});

test("formats Datastar SSE responses", async () => {
	const response = sse(
		'event: datastar-patch-elements\ndata: elements <div id="x">OK</div>\n\n',
	);

	expect(response.headers.get("cache-control")).toBe("no-cache");
	expect(await response.text()).toEndWith("\n\n");
});
