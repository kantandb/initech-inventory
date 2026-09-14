import { describe, expect, test } from "bun:test";
import { bootstrap, waitHealth } from "../../scripts/bootstrap.js";

function response(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("waitHealth", () => {
	test("retries until KantanDB is healthy", async () => {
		let calls = 0;
		const fetcher = () => {
			calls += 1;

			return Promise.resolve(response({}, calls === 1 ? 503 : 200));
		};

		await waitHealth("http://database", fetcher, 100, 0);
		expect(calls).toBe(2);
	});
});

describe("bootstrap", () => {
	test("creates and imports an empty database", async () => {
		const requests = [];
		const fetcher = (url, init = {}) => {
			requests.push({ url, init });
			if (url.endsWith("/healthz"))
				return Promise.resolve(response({ status: "ok" }));
			if (url.endsWith("/db")) return Promise.resolve(response({}, 201));
			if (url.includes("?limit=1")) {
				return Promise.resolve(response({ documents: [], cursor: "" }));
			}

			return Promise.resolve(response({ success: true, error: {} }));
		};

		const result = await bootstrap({
			url: "http://database",
			fixture: "test/fixtures/inventory.ndjson",
			fetcher,
		});

		expect(result).toEqual({ created: true, imported: true });
		expect(requests.at(-1).url).toBe("http://database/bulk/inventory");
		expect(requests.at(-1).init.headers).toEqual({
			"content-type": "application/x-ndjson",
		});
	});

	test("does not import a populated database", async () => {
		const methods = [];
		const fetcher = (url, init = {}) => {
			methods.push(init.method ?? "GET");
			if (url.endsWith("/healthz"))
				return Promise.resolve(response({ status: "ok" }));
			if (url.endsWith("/db")) return Promise.resolve(response({}, 409));

			return Promise.resolve(response({ documents: ["id"], cursor: "" }));
		};

		expect(await bootstrap({ url: "http://database", fetcher })).toEqual({
			created: false,
			imported: false,
		});
		expect(methods).toEqual(["GET", "POST", "GET"]);
	});
});
