import { describe, expect, test } from "bun:test";
import { createApi } from "../../src/api.js";
import { KantanError } from "../../src/kantan.js";

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

describe("inventory API", () => {
	test("creates a validated item and returns its ETag", async () => {
		const client = {
			create(value) {
				return Promise.resolve({ id: "id", etag: '"etag"', item: value });
			},
		};
		const api = createApi(client);
		const response = await api(
			new Request("http://app/api/items", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(item()),
			}),
		);

		expect(response.status).toBe(201);
		expect(response.headers.get("etag")).toBe('"etag"');
		expect(await response.json()).toEqual({
			...item(),
			id: "id",
			etag: '"etag"',
		});
	});

	test("returns consistent validation errors", async () => {
		const api = createApi({});
		const response = await api(
			new Request("http://app/api/items", {
				method: "POST",
				body: JSON.stringify({}),
			}),
		);
		const result = await response.json();

		expect(response.status).toBe(422);
		expect(result.error.code).toBe("validation_error");
		expect(result.error.details).toContainEqual({
			path: "/name",
			message: "is required",
		});
	});

	test("requires If-Match for mutations", async () => {
		const api = createApi({});
		const response = await api(
			new Request("http://app/api/items/id", {
				method: "DELETE",
			}),
		);

		expect(response.status).toBe(428);
		expect(await response.json()).toEqual({
			error: {
				code: "precondition_required",
				message: "If-Match header is required",
				details: [],
			},
		});
	});

	test("maps ETag conflicts without exposing database responses", async () => {
		const client = {
			read() {
				return Promise.resolve({ id: "id", etag: '"new"', item: item() });
			},
			patch() {
				throw new KantanError(412, {
					error: { message: "precondition failed", internal: "secret" },
				});
			},
		};
		const api = createApi(client);
		const response = await api(
			new Request("http://app/api/items/id", {
				method: "PATCH",
				headers: {
					"content-type": "application/json",
					"if-match": '"00000000000000000000000000000000"',
				},
				body: JSON.stringify({ quantity: 20 }),
			}),
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: { code: "conflict", message: "precondition failed" },
		});
	});
});
