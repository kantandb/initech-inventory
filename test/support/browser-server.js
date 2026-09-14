import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrap } from "../../scripts/bootstrap.js";
import { ensureKey } from "../../scripts/key.js";

const dbUrl = "http://127.0.0.1:18080";
const directory = await mkdtemp(join(tmpdir(), "initech-browser-"));
const key = join(directory, "kantan.key");
await ensureKey(key);

const database = Bun.spawn(
	[
		"./kantan",
		"-addr",
		"127.0.0.1:18080",
		"-data",
		join(directory, "data"),
		"-key-file",
		key,
		"-bulk-max-documents",
		"100",
	],
	{ stdout: "ignore", stderr: "inherit" },
);
let application;
let stopping = false;

async function stop() {
	if (stopping) return;
	stopping = true;
	application?.kill("SIGTERM");
	database.kill("SIGTERM");
	await Promise.allSettled([application?.exited, database.exited]);
	await rm(directory, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, async () => {
		await stop();
		process.exit(0);
	});
}

try {
	await bootstrap({
		url: dbUrl,
		database: "inventory_browser",
		fixture: "test/fixtures/browser.ndjson",
	});
	application = Bun.spawn([process.execPath, "src/server.js"], {
		env: {
			...process.env,
			APP_PORT: "18081",
			KANTANDB_URL: dbUrl,
			KANTANDB_DATABASE: "inventory_browser",
		},
		stdout: "ignore",
		stderr: "inherit",
	});
	process.exitCode = await application.exited;
} finally {
	await stop();
}
