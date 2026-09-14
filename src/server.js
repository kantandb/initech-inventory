import { createApi } from "./api.js";
import { KantanClient } from "./kantan.js";

export function appPort(value = Bun.env.APP_PORT) {
	return Number(value ?? 8081);
}

export function createApp(client = new KantanClient()) {
	const api = createApi(client);

	return async function fetch(request) {
		const response = await api(request);

		return response ?? new Response("Initech Inventory\n");
	};
}

if (import.meta.main) {
	const server = Bun.serve({
		port: appPort(),
		fetch: createApp(),
	});

	console.log(`Listening on http://localhost:${server.port}`);
}
