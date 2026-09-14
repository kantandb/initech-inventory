import { indexes } from "../src/inventory.js";

function endpoint(base, path) {
	return `${base.replace(/\/$/, "")}${path}`;
}

async function failure(response) {
	const body = await response.text();

	return body || response.statusText || `HTTP ${response.status}`;
}

export async function waitHealth(
	url,
	fetcher = fetch,
	timeout = 10_000,
	interval = 100,
) {
	const deadline = Date.now() + timeout;

	while (Date.now() <= deadline) {
		try {
			const response = await fetcher(endpoint(url, "/healthz"));
			if (response.ok) {
				return;
			}
		} catch {
			// The server may still be starting.
		}

		await Bun.sleep(interval);
	}

	throw new Error(`KantanDB did not become healthy at ${url}`);
}

export async function bootstrap({
	url = Bun.env.KANTANDB_URL ?? "http://localhost:8080",
	database = Bun.env.KANTANDB_DATABASE ?? "inventory",
	fixture = "fixtures/inventory.ndjson",
	fetcher = fetch,
} = {}) {
	await waitHealth(url, fetcher);

	const create = await fetcher(endpoint(url, "/db"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: database, indexes }),
	});
	if (create.status !== 201 && create.status !== 409) {
		throw new Error(`Database creation failed: ${await failure(create)}`);
	}

	const path = `/db/${encodeURIComponent(database)}?limit=1`;
	const list = await fetcher(endpoint(url, path));
	if (!list.ok) {
		throw new Error(`Database check failed: ${await failure(list)}`);
	}

	const { documents } = await list.json();
	if (documents.length > 0) {
		return { created: create.status === 201, imported: false };
	}

	const data = await Bun.file(fixture).text();
	const imported = await fetcher(
		endpoint(url, `/bulk/${encodeURIComponent(database)}`),
		{
			method: "POST",
			headers: { "content-type": "application/x-ndjson" },
			body: data,
		},
	);
	if (!imported.ok) {
		throw new Error(`Fixture import failed: ${await failure(imported)}`);
	}

	const result = await imported.json();
	if (!result.success) {
		throw new Error(`Fixture import failed: ${JSON.stringify(result.error)}`);
	}

	return { created: create.status === 201, imported: true };
}

if (import.meta.main) {
	const result = await bootstrap();
	console.error(
		result.imported
			? "Created and populated inventory database"
			: "Kept populated inventory database",
	);
}
