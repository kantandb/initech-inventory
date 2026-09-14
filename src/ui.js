import { categories, manufacturerSuggestions } from "./inventory.js";
import {
	InputError,
	InventoryService,
	parseFilters,
} from "./inventory-service.js";
import { KantanError } from "./kantan.js";

// biome-ignore lint/suspicious/noShadowRestrictedNames: Encodes values for HTML.
function escape(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function label(value) {
	return value
		.replaceAll("_", " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function expression(value) {
	return escape(JSON.stringify(value));
}

function option(value, selected) {
	return `<option value="${escape(value)}"${value === selected ? " selected" : ""}>${escape(label(value))}</option>`;
}

function location(item) {
	return `Warehouse ${item.location.warehouse}, aisle ${item.location.aisle}, shelf ${item.location.shelf}`;
}

export function renderCard(item) {
	const id = escape(item.id);
	const etag = expression(item.etag);
	const parts = item.part_numbers.length
		? item.part_numbers.map(escape).join(", ")
		: "None";
	const filters =
		"{category: $category, manufacturer: $manufacturer, quantity_min: $quantity_min, quantity_max: $quantity_max, reserved: $reserved, warehouse: $warehouse, aisle: $aisle, shelf: $shelf}";

	return `<article class="item-card" id="item-${id}">
	<div class="card-heading">
		<div>
			<p class="eyebrow">${escape(label(item.category))}</p>
			<h2>${escape(item.name)}</h2>
		</div>
		<button class="link-button card-icon" aria-label="Edit item" title="Edit item" data-on:click="@get('/ui/items/${id}/edit')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"></path><path d="m14 7 3 3"></path></svg></button>
	</div>
	<dl>
		<div><dt>Manufacturer</dt><dd>${escape(item.manufacturer)}</dd></div>
		<div><dt>Part numbers</dt><dd>${parts}</dd></div>
		<div><dt>Location</dt><dd>${escape(location(item))}</dd></div>
		<div><dt>Quantity</dt><dd class="quantity">${item.quantity}</dd></div>
	</dl>
	<footer>
		<div class="quantity-actions" aria-label="Change quantity">
			<button aria-label="Decrease quantity" data-indicator:working data-attr:disabled="$working || ${item.quantity} === 0" data-on:click="@patch('/ui/items/${id}/quantity?delta=-1', {headers: {'If-Match': ${etag}}, payload: ${filters}})">−</button>
			<span>${item.quantity}</span>
			<button aria-label="Increase quantity" data-indicator:working data-attr:disabled="$working || ${item.quantity} === 100" data-on:click="@patch('/ui/items/${id}/quantity?delta=1', {headers: {'If-Match': ${etag}}, payload: ${filters}})">+</button>
		</div>
		<label class="reserved"><input type="checkbox"${item.reserved ? " checked" : ""} data-on:change="@patch('/ui/items/${id}/reserved?value=' + evt.target.checked, {headers: {'If-Match': ${etag}}, payload: ${filters}})"> Reserved</label>
		<button class="danger link-button card-icon" aria-label="Delete item" title="Delete item" data-on:click="confirm('Delete this item?') && @delete('/ui/items/${id}', {headers: {'If-Match': ${etag}}, payload: ${filters}})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg></button>
	</footer>
</article>`;
}

export function renderResults(result) {
	const cards = result.items.map(renderCard).join("\n");
	const content =
		cards ||
		`<div class="empty"><h2>No inventory found</h2><p>Try clearing a filter.</p></div>`;
	const next = result.cursor
		? `<button class="next" data-on:click="@get('/ui/items?cursor=${encodeURIComponent(result.cursor)}')">Next page</button>`
		: "";

	return `<section id="inventory-results" aria-live="polite">
	<p class="result-count">${result.items.length} item${result.items.length === 1 ? "" : "s"}</p>
	<div class="card-grid" id="item-grid">${content}</div>
	${next}
</section>`;
}

function renderNav() {
	const warehouses = Array.from({ length: 6 }, (_, index) => index + 1)
		.map(
			(warehouse) =>
				`<button data-on:click="$draft_warehouse = ${warehouse}">Warehouse ${warehouse}</button>`,
		)
		.join("");
	const aisles = ["", "A", "B", "C", "D", "E", "F", "G", "H"]
		.map((aisle) => option(aisle, ""))
		.join("");

	return `<aside class="locations" aria-label="Location navigation">
	<h2>Locations</h2>
	<button data-on:click="$draft_warehouse = ''; $draft_aisle = ''; $draft_shelf = ''">All locations</button>
	${warehouses}
	<label>Aisle<select data-bind:draft_aisle>${aisles}</select></label>
	<label>Shelf<input type="number" min="1" max="30" placeholder="Any" data-bind:draft_shelf></label>
</aside>`;
}

function formSignals(item = {}) {
	return {
		editName: item.name ?? "",
		editCategory: item.category ?? categories[0],
		editManufacturer: item.manufacturer ?? "",
		editPartOne: item.part_numbers?.[0] ?? "",
		editPartTwo: item.part_numbers?.[1] ?? "",
		editQuantity: item.quantity ?? 0,
		editReserved: item.reserved ?? false,
		editWarehouse: item.location?.warehouse ?? 1,
		editAisle: item.location?.aisle ?? "A",
		editShelf: item.location?.shelf ?? 1,
	};
}

export function renderModal(item) {
	const editing = Boolean(item);
	const action = editing ? `/ui/items/${escape(item.id)}` : "/ui/items";
	const method = editing ? "put" : "post";
	const headers = editing
		? `, {headers: {'If-Match': ${expression(item.etag)}}}`
		: "";
	const values = formSignals(item);

	return `<div id="modal-root" class="modal-backdrop">
	<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-signals='${escape(JSON.stringify(values))}'>
		<div class="modal-heading"><h2 id="modal-title">${editing ? "Edit item" : "Add item"}</h2><button class="close" aria-label="Close" data-on:click="@get('/ui/modal/close')">×</button></div>
		<form data-on:submit="evt.preventDefault(); @${method}('${action}'${headers})">
			<label>Name<input required data-bind:editName></label>
			<label>Category<select data-bind:editCategory>${categories.map((category) => option(category, values.editCategory)).join("")}</select></label>
			<label>Manufacturer<input required data-bind:editManufacturer></label>
			<div class="form-row"><label>Part number<input pattern="[A-Z0-9]{4}-[A-Z0-9]{7}" data-bind:editPartOne></label><label>Second part number<input pattern="[A-Z0-9]{4}-[A-Z0-9]{7}" data-bind:editPartTwo></label></div>
			<div class="form-row"><label>Quantity<input required type="number" min="0" max="100" data-bind:editQuantity></label><label>Warehouse<input required type="number" data-bind:editWarehouse></label></div>
			<div class="form-row"><label>Aisle<input required data-bind:editAisle></label><label>Shelf<input required type="number" data-bind:editShelf></label></div>
			<label class="reserved"><input type="checkbox" data-bind:editReserved> Reserved</label>
			<div id="modal-error"></div>
			<button class="primary" type="submit" data-indicator:saving data-attr:disabled="$saving"><span data-show="!$saving">Save item</span><span data-show="$saving">Saving…</span></button>
		</form>
	</section>
</div>`;
}

function renderFilters() {
	const manufacturers = manufacturerSuggestions
		.map((manufacturer) => `<option value="${escape(manufacturer)}"></option>`)
		.join("");
	const apply =
		"$category = $draft_category; $manufacturer = $draft_manufacturer; $quantity_min = $draft_quantity_min; $quantity_max = $draft_quantity_max; $reserved = $draft_reserved; $warehouse = $draft_warehouse; $aisle = $draft_aisle; $shelf = $draft_shelf; $cursor = ''; @get('/ui/items')";
	const reset =
		"$draft_category = ''; $draft_manufacturer = ''; $draft_quantity_min = 0; $draft_quantity_max = 100; $draft_reserved = ''; $draft_warehouse = ''; $draft_aisle = ''; $draft_shelf = ''; $category = ''; $manufacturer = ''; $quantity_min = 0; $quantity_max = 100; $reserved = ''; $warehouse = ''; $aisle = ''; $shelf = ''; $cursor = ''; @get('/ui/items')";

	return `<div class="filters" data-indicator:loading>
	<label>Category<select data-bind:draft_category><option value="">All categories</option>${categories.map((category) => option(category, "")).join("")}</select></label>
	<label>Manufacturer<input list="manufacturer-options" placeholder="Any" data-bind:draft_manufacturer><datalist id="manufacturer-options">${manufacturers}</datalist></label>
	<label class="quantity-filter">Quantity <span class="quantity-inputs"><input aria-label="Minimum quantity" type="number" min="0" max="100" data-bind:draft_quantity_min><span>to</span><input aria-label="Maximum quantity" type="number" min="0" max="100" data-bind:draft_quantity_max></span></label>
	<label>Reservation<select data-bind:draft_reserved><option value="">Any</option><option value="true">Reserved</option><option value="false">Not reserved</option></select></label>
	<div class="filter-actions"><button class="primary" data-on:click="${apply}">Apply filter</button><button data-on:click="${reset}">Reset filter</button></div>
	<span class="loading" data-show="$loading">Loading…</span>
</div>`;
}

export function renderPage(result) {
	const signals = escape(
		JSON.stringify({
			draft_category: "",
			draft_manufacturer: "",
			draft_quantity_min: 0,
			draft_quantity_max: 100,
			draft_reserved: "",
			draft_warehouse: "",
			draft_aisle: "",
			draft_shelf: "",
			category: "",
			manufacturer: "",
			quantity_min: 0,
			quantity_max: 100,
			reserved: "",
			warehouse: "",
			aisle: "",
			shelf: "",
			cursor: "",
		}),
	);

	return `<!doctype html>
<html lang="en" data-signals='${signals}'>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Initech Inventory</title>
	<link rel="stylesheet" href="/app.css">
	<script type="module" src="/datastar.js"></script>
</head>
<body>
	<header class="topbar"><a class="logo" href="/">INITECH <span>Inventory</span></a>${renderFilters()}<button class="primary icon-button" aria-label="Add item" title="Add item" data-on:click="@get('/ui/items/new')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg></button></header>
	<div id="status" role="status"></div>
	<main>${renderNav()}${renderResults(result)}</main>
	<div id="modal-root"></div>
</body>
</html>`;
}

function patch(html, options = {}) {
	const lines = ["event: datastar-patch-elements"];
	if (options.selector) lines.push(`data: selector ${options.selector}`);
	if (options.mode) lines.push(`data: mode ${options.mode}`);
	for (const line of html.split("\n")) lines.push(`data: elements ${line}`);

	return `${lines.join("\n")}\n\n`;
}

export function sse(...events) {
	return new Response(events.join(""), {
		headers: {
			"cache-control": "no-cache",
			"content-type": "text/event-stream",
		},
	});
}

function status(message, type = "error") {
	return `<div id="status" class="notice ${type}">${escape(message)}</div>`;
}

function clearStatus() {
	return `<div id="status" role="status"></div>`;
}

function clearModal() {
	return `<div id="modal-root"></div>`;
}

function uiError(cause) {
	if (cause instanceof InputError) {
		const details = cause.details.map((detail) => detail.message).join(", ");

		return status(details || cause.message, "validation");
	}
	if (cause instanceof KantanError && cause.status === 412) {
		return status(
			"This item changed elsewhere. Reload it and try again.",
			"conflict",
		);
	}
	if (cause instanceof KantanError) {
		return status("KantanDB is unavailable. Try again shortly.", "database");
	}

	console.error(cause);

	return status("Something went wrong.");
}

function filterParams(signals = {}, cursor) {
	const params = new URLSearchParams();
	const values = {
		category: signals.category,
		manufacturer: signals.manufacturer,
		quantity_min: signals.quantity_min ?? signals.quantityMin,
		quantity_max: signals.quantity_max ?? signals.quantityMax,
		reserved: signals.reserved,
		warehouse: signals.warehouse,
		aisle: signals.aisle,
		shelf: signals.shelf,
		cursor: cursor ?? signals.cursor,
	};
	for (const [key, value] of Object.entries(values)) {
		if (value !== undefined && value !== null && value !== "") {
			params.set(key, String(value));
		}
	}

	return params;
}

function signalParams(url) {
	const raw = url.searchParams.get("datastar");
	let signals = {};
	if (raw) {
		try {
			signals = JSON.parse(raw);
		} catch {
			throw new InputError("Filter signals are invalid");
		}
	}

	return filterParams(signals, url.searchParams.get("cursor"));
}

async function requestSignals(request) {
	try {
		return await request.json();
	} catch {
		throw new InputError("Request signals are invalid");
	}
}

function requestItem(signals) {
	const parts = [signals.editPartOne, signals.editPartTwo]
		.map((part) => String(part ?? "").trim())
		.filter(Boolean);

	return {
		name: String(signals.editName ?? ""),
		category: String(signals.editCategory ?? ""),
		manufacturer: String(signals.editManufacturer ?? ""),
		part_numbers: parts,
		quantity: Number(signals.editQuantity),
		reserved: signals.editReserved === true || signals.editReserved === "true",
		location: {
			warehouse: Number(signals.editWarehouse),
			aisle: String(signals.editAisle ?? ""),
			shelf: Number(signals.editShelf),
		},
	};
}

export function createUi(client) {
	const inventory = new InventoryService(client);

	return async function ui(request) {
		const url = new URL(request.url);
		if (url.pathname === "/") {
			try {
				const result = await inventory.list(
					parseFilters(new URLSearchParams()),
				);

				return new Response(renderPage(result), {
					headers: { "content-type": "text/html; charset=utf-8" },
				});
			} catch (cause) {
				return new Response(
					renderPage({ items: [], cursor: "" }).replace(
						clearStatus(),
						uiError(cause),
					),
					{
						headers: { "content-type": "text/html; charset=utf-8" },
					},
				);
			}
		}
		if (url.pathname === "/datastar.js") {
			return new Response(Bun.file("public/datastar.js"), {
				headers: { "content-type": "text/javascript; charset=utf-8" },
			});
		}
		if (url.pathname === "/app.css") {
			return new Response(Bun.file("public/app.css"), {
				headers: { "content-type": "text/css; charset=utf-8" },
			});
		}
		if (url.pathname === "/ui/items" && request.method === "GET") {
			try {
				const result = await inventory.list(parseFilters(signalParams(url)));

				return sse(patch(renderResults(result)), patch(clearStatus()));
			} catch (cause) {
				return sse(patch(uiError(cause)));
			}
		}
		if (url.pathname === "/ui/items/new" && request.method === "GET") {
			return sse(patch(renderModal()));
		}
		if (url.pathname === "/ui/modal/close" && request.method === "GET") {
			return sse(patch(clearModal()));
		}

		const edit = url.pathname.match(/^\/ui\/items\/([^/]+)\/edit$/);
		if (edit && request.method === "GET") {
			try {
				return sse(patch(renderModal(await inventory.read(edit[1]))));
			} catch (cause) {
				return sse(patch(uiError(cause)));
			}
		}
		if (url.pathname === "/ui/items" && request.method === "POST") {
			try {
				const signals = await requestSignals(request);
				await inventory.create(requestItem(signals));
				const result = await inventory.list(
					parseFilters(filterParams(signals)),
				);

				return sse(
					patch(renderResults(result)),
					patch(clearModal()),
					patch(status("Item created.", "success")),
				);
			} catch (cause) {
				return sse(patch(uiError(cause)));
			}
		}

		const quantity = url.pathname.match(/^\/ui\/items\/([^/]+)\/quantity$/);
		const reservation = url.pathname.match(/^\/ui\/items\/([^/]+)\/reserved$/);
		const item = url.pathname.match(/^\/ui\/items\/([^/]+)$/);
		try {
			if (quantity && request.method === "PATCH") {
				const delta = Number(url.searchParams.get("delta"));
				if (delta !== -1 && delta !== 1) {
					throw new InputError("Quantity delta must be -1 or 1");
				}

				const signals = await requestSignals(request);
				const current = await inventory.read(quantity[1]);
				await inventory.patch(
					quantity[1],
					{ quantity: current.quantity + delta },
					request.headers.get("if-match"),
				);
				const result = await inventory.list(
					parseFilters(filterParams(signals)),
				);

				return sse(patch(renderResults(result)), patch(clearStatus()));
			}
			if (reservation && request.method === "PATCH") {
				const value = url.searchParams.get("value");
				if (value !== "true" && value !== "false") {
					throw new InputError("Reservation value must be true or false");
				}

				const signals = await requestSignals(request);
				await inventory.patch(
					reservation[1],
					{ reserved: value === "true" },
					request.headers.get("if-match"),
				);
				const result = await inventory.list(
					parseFilters(filterParams(signals)),
				);

				return sse(patch(renderResults(result)), patch(clearStatus()));
			}
			if (item && request.method === "PUT") {
				const signals = await requestSignals(request);
				await inventory.replace(
					item[1],
					requestItem(signals),
					request.headers.get("if-match"),
				);
				const result = await inventory.list(
					parseFilters(filterParams(signals)),
				);

				return sse(
					patch(renderResults(result)),
					patch(clearModal()),
					patch(status("Item saved.", "success")),
				);
			}
			if (item && request.method === "DELETE") {
				const signals = await requestSignals(request);
				await inventory.delete(item[1], request.headers.get("if-match"));
				const result = await inventory.list(
					parseFilters(filterParams(signals)),
				);

				return sse(
					patch(renderResults(result)),
					patch(status("Item deleted.", "success")),
				);
			}
		} catch (cause) {
			return sse(patch(uiError(cause)));
		}

		return null;
	};
}
