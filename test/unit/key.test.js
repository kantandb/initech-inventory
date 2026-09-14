import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureKey } from "../../scripts/key.js";

let directory;

afterEach(async () => {
	if (directory) {
		await rm(directory, { recursive: true, force: true });
		directory = undefined;
	}
});

async function target() {
	directory = await mkdtemp(join(tmpdir(), "initech-key-"));

	return join(directory, "kantan.key");
}

test("creates a base64 32-byte key with mode 0600", async () => {
	const path = await target();

	expect(await ensureKey(path)).toBe(true);
	const key = (await readFile(path, "utf8")).trim();
	expect(Buffer.from(key, "base64")).toHaveLength(32);
	expect((await stat(path)).mode & 0o777).toBe(0o600);
});

test("preserves an existing key and repairs its mode", async () => {
	const path = await target();
	await writeFile(path, "existing\n", { mode: 0o644 });

	expect(await ensureKey(path)).toBe(false);
	expect(await readFile(path, "utf8")).toBe("existing\n");
	expect((await stat(path)).mode & 0o777).toBe(0o600);
});
