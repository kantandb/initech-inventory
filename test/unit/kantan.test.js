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
	test("lists and queries document IDs", async () => {
		const { calls, fetcher } = mock([
			json({ documents: ["one"], cursor: "next" }),
			json({ documents: ["two"], cursor: "" }),
		]);
		const client = new KantanClient({ url: "http://db", fetcher });

		expect(
			await client.list({
				limit: 10,
				cursor: "cursor",
				index: "name",
				op: "ge",
				value: "A",
			}),
		).toEqual({ documents: ["one"], cursor: "next" });
		const listUrl = new URL(calls[0].url);
		expect(Object.fromEntries(listUrl.searchParams)).toEqual({
			limit: "10",
			cursor: "cursor",
			index: "name",
			value: '"A"',
			op: "ge",
		});

		expect(
			await client.query({
				path: "$.quantity",
				op: "ge",
				value: 10,
				limit: 5,
				cursor: "next",
			}),
		).toEqual({ documents: ["two"], cursor: "" });
		expect(calls[1].init.method).toBe("QUERY");
		expect(JSON.parse(calls[1].init.body)).toEqual({
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
