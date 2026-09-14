import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getContract } from "../../scripts/openapi.js";

let directory;

afterEach(async () => {
	if (directory) {
		await rm(directory, { recursive: true, force: true });
		directory = undefined;
	}
});

async function target() {
	directory = await mkdtemp(join(tmpdir(), "initech-openapi-"));

	return join(directory, "openapi.yaml");
}

describe("getContract", () => {
	test("downloads an absent contract", async () => {
		const path = await target();
		const fetcher = () => Promise.resolve(new Response("openapi: 3.2.0\n"));

		expect(await getContract(path, false, fetcher)).toBe(true);
		expect(await Bun.file(path).text()).toBe("openapi: 3.2.0\n");
	});

	test("keeps an existing contract", async () => {
		const path = await target();
		await Bun.write(path, "existing");
		let fetched = false;

		await getContract(path, false, () => {
			fetched = true;
			return Promise.resolve(new Response("openapi: 3.2.0\n"));
		});

		expect(fetched).toBe(false);
		expect(await Bun.file(path).text()).toBe("existing");
	});

	test("refreshes an existing contract", async () => {
		const path = await target();
		await Bun.write(path, "existing");
		const fetcher = () => Promise.resolve(new Response("openapi: 3.2.0\n"));

		expect(await getContract(path, true, fetcher)).toBe(true);
		expect(await Bun.file(path).text()).toBe("openapi: 3.2.0\n");
	});
});
