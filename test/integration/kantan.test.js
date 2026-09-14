import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrap, waitHealth } from "../../scripts/bootstrap.js";
import { ensureKey } from "../../scripts/key.js";
import { KantanClient, KantanError } from "../../src/kantan.js";

let child;
let directory;
let url;

beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), "initech-integration-"));
	const key = join(directory, "kantan.key");
	const data = join(directory, "data");
	await ensureKey(key);

	const probe = Bun.serve({ port: 0, fetch: () => new Response() });
	const port = probe.port;
	await probe.stop(true);
	url = `http://127.0.0.1:${port}`;
	child = Bun.spawn(
		[
			"./kantan",
			"-addr",
			`127.0.0.1:${port}`,
			"-data",
			data,
			"-key-file",
			key,
			"-bulk-max-documents",
			"100",
		],
		{ stdout: "ignore", stderr: "ignore" },
	);
	await waitHealth(url);
});

afterAll(async () => {
	child?.kill("SIGTERM");
	await child?.exited;
	if (directory) await rm(directory, { recursive: true, force: true });
});

describe("KantanDB integration", () => {
	test("bootstraps idempotently", async () => {
		const options = {
			url,
			database: "inventory_test",
			fixture: "test/fixtures/inventory.ndjson",
		};

		expect(await bootstrap(options)).toEqual({ created: true, imported: true });
		expect(await bootstrap(options)).toEqual({
			created: false,
			imported: false,
		});

		const client = new KantanClient({ url, database: options.database });
		expect((await client.list()).documents).toHaveLength(1);
	});

	test("runs CRUD, queries, and ETag conflict checks", async () => {
		const client = new KantanClient({ url, database: "inventory_test" });
		const value = {
			name: "Integration Router",
			category: "network_equipment",
			manufacturer: "Initech",
			part_numbers: [],
			quantity: 10,
			reserved: false,
			location: { warehouse: 1, aisle: "A", shelf: 1 },
		};

		const created = await client.create(value);
		expect(created.etag).toMatch(/^"[0-9a-f]{32}"$/);
		expect(await client.read(created.id)).toEqual(created);

		const patched = await client.patch(
			created.id,
			{ quantity: 11 },
			created.etag,
		);
		expect(patched.item.quantity).toBe(11);
		expect(patched.etag).not.toBe(created.etag);
		expect(
			client.patch(created.id, { quantity: 12 }, created.etag),
		).rejects.toEqual(expect.objectContaining({ status: 412 }));

		const replacedValue = { ...value, quantity: 12, reserved: true };
		const replaced = await client.replace(
			created.id,
			replacedValue,
			patched.etag,
		);
		expect(replaced.item).toEqual(replacedValue);
		expect(
			(await client.query({ path: "$.name", value: value.name })).documents,
		).toContain(created.id);

		await client.delete(created.id, replaced.etag);
		expect(client.read(created.id)).rejects.toBeInstanceOf(KantanError);
	});
});
