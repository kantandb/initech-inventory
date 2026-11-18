import { describe, expect, test } from "bun:test";
import { KantanClient, KantanError } from "../../src/kantan.js";

function json(body, status = 200, headers = {}) {
	return Response.json(body, { status, headers });
}

function mock(responses) {
	const calls = [];
	const fetcher = (url, init = {}) => {
		calls.push({ url, init });

		return Promise.resolve(responses.shift());
	};

	return { calls, fetcher };
}

describe("KantanClient", () => {
	test("lists and queries document records", async () => {
		const one = { id: "one", rev: "first", doc: { name: "Alpha" } };
		const two = { id: "two", rev: "second", doc: { name: "Beta" } };
		const three = { id: "three", rev: "third", doc: { quantity: 10 } };
		const { calls, fetcher } = mock([
			json({ documents: [one], cursor: "id-cursor" }),
			json({ documents: [two], cursor: "index-cursor" }),
			json({ documents: [three], cursor: "" }),
		]);
		const client = new KantanClient({ url: "http://db", fetcher });

		expect(await client.list({ limit: 10, cursor: "previous-id" })).toEqual({
			documents: [one],
			cursor: "id-cursor",
		});
		expect(calls[0].url).toBe("http://db/db/inventory");
		expect(calls[0].init.method).toBe("QUERY");
		expect(JSON.parse(calls[0].init.body)).toEqual({
			limit: 10,
			cursor: "previous-id",
		});

		const namedQuery = { index: "name", op: "ge", value: "", limit: 1 };
		expect(await client.query(namedQuery)).toEqual({
			documents: [two],
			cursor: "index-cursor",
		});
		expect(calls[1].url).toBe("http://db/db/inventory");
		expect(calls[1].init.method).toBe("QUERY");
		expect(calls[1].init.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(calls[1].init.body)).toEqual(namedQuery);

		expect(
			await client.query({
				path: "$.quantity",
				op: "ge",
				value: 10,
				limit: 5,
				cursor: "next",
			}),
		).toEqual({ documents: [three], cursor: "" });
		expect(calls[2].init.method).toBe("QUERY");
		expect(JSON.parse(calls[2].init.body)).toEqual({
			path: "$.quantity",
			value: 10,
			limit: 5,
			op: "ge",
			cursor: "next",
		});
	});

	test("reads and creates documents with ETags", async () => {
		const { calls, fetcher } = mock([
			json({ name: "Router" }, 200, { etag: '"read"' }),
			json({ id: "new-id" }, 201, { etag: '"created"' }),
		]);
		const client = new KantanClient({ url: "http://db", fetcher });

		expect(await client.read("item-id")).toEqual({
			id: "item-id",
			etag: '"read"',
			item: { name: "Router" },
		});
		expect(await client.create({ name: "Switch" })).toEqual({
			id: "new-id",
			etag: '"created"',
			item: { name: "Switch" },
		});
		expect(calls[1].init.method).toBe("POST");
	});

	test("patches, replaces, and deletes with If-Match", async () => {
		const { calls, fetcher } = mock([
			json({ quantity: 2 }, 200, { etag: '"two"' }),
			json({ quantity: 3 }, 200, { etag: '"three"' }),
			new Response(null, { status: 204 }),
		]);
		const client = new KantanClient({ url: "http://db", fetcher });

		expect(await client.patch("id", { quantity: 2 }, '"one"')).toEqual({
			id: "id",
			etag: '"two"',
			item: { quantity: 2 },
		});
		expect(await client.replace("id", { quantity: 3 }, '"two"')).toEqual({
			id: "id",
			etag: '"three"',
			item: { quantity: 3 },
		});
		await client.delete("id", '"three"');

		expect(calls.map(({ init }) => init.method)).toEqual([
			"PATCH",
			"PUT",
			"DELETE",
		]);
		expect(calls.map(({ init }) => init.headers["if-match"])).toEqual([
			'"one"',
			'"two"',
			'"three"',
		]);
	});

	test("reports KantanDB errors", async () => {
		const { fetcher } = mock([
			json({ error: { message: "revision differs" } }, 412),
		]);
		const client = new KantanClient({ url: "http://db", fetcher });

		expect(client.read("id")).rejects.toEqual(
			expect.objectContaining({
				name: "KantanError",
				status: 412,
				message: "revision differs",
			}),
		);
		expect(KantanError).toBeDefined();
	});
});
