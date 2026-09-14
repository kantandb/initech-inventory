import {
	InputError,
	InventoryService,
	parseFilters,
} from "./inventory-service.js";
import { KantanError } from "./kantan.js";

function json(body, status = 200, headers = {}) {
	return Response.json(body, { status, headers });
}

function error(status, code, message, details) {
	return json(
		{ error: { code, message, ...(details ? { details } : {}) } },
		status,
	);
}

async function body(request) {
	try {
		return await request.json();
	} catch {
		throw new InputError("Request body must be valid JSON");
	}
}

function etag(request) {
	const value = request.headers.get("if-match");
	if (!value) {
		throw new InputError("If-Match header is required", [], 428);
	}
	if (!/^(\*|"[0-9a-f]{32}")$/.test(value)) {
		throw new InputError("If-Match header is invalid");
	}

	return value;
}

function result(item, status = 200) {
	return json(item, status, item.etag ? { etag: item.etag } : {});
}

function failure(cause) {
	if (cause instanceof InputError) {
		const code =
			cause.status === 422
				? "validation_error"
				: cause.status === 428
					? "precondition_required"
					: "bad_request";

		return error(cause.status, code, cause.message, cause.details);
	}
	if (cause instanceof KantanError) {
		if (cause.status === 400) return error(400, "bad_request", cause.message);
		if (cause.status === 404) return error(404, "not_found", cause.message);
		if (cause.status === 412) return error(409, "conflict", cause.message);
		if (cause.status === 503) {
			return error(503, "database_unavailable", cause.message);
		}

		return error(502, "database_error", cause.message);
	}

	console.error(cause);

	return error(500, "internal_error", "Unexpected server error");
}

export function createApi(client) {
	const inventory = new InventoryService(client);

	return async function api(request) {
		const url = new URL(request.url);
		if (url.pathname === "/api/items") {
			try {
				if (request.method === "GET") {
					return json(await inventory.list(parseFilters(url.searchParams)));
				}
				if (request.method === "POST") {
					return result(await inventory.create(await body(request)), 201);
				}
			} catch (cause) {
				return failure(cause);
			}

			return error(405, "method_not_allowed", "Method not allowed");
		}

		const match = url.pathname.match(/^\/api\/items\/([^/]+)$/);
		if (!match) return null;

		let id;
		try {
			id = decodeURIComponent(match[1]);
		} catch {
			return error(400, "bad_request", "Item ID is invalid");
		}

		try {
			switch (request.method) {
				case "GET":
					return result(await inventory.read(id));
				case "PATCH":
					return result(
						await inventory.patch(id, await body(request), etag(request)),
					);
				case "PUT":
					return result(
						await inventory.replace(id, await body(request), etag(request)),
					);
				case "DELETE":
					await inventory.delete(id, etag(request));

					return new Response(null, { status: 204 });
				default:
					return error(405, "method_not_allowed", "Method not allowed");
			}
		} catch (cause) {
			return failure(cause);
		}
	};
}
