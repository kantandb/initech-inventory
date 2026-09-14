import { createApi } from "./api.js";
import { KantanClient } from "./kantan.js";
import { createUi } from "./ui.js";

export function appPort(value = Bun.env.APP_PORT) {
	return Number(value ?? 8081);
}

export function createApp(client = new KantanClient()) {
	const api = createApi(client);
	const ui = createUi(client);

	return async function fetch(request) {
		return (
			(await api(request)) ??
			(await ui(request)) ??
			new Response("Not found", { status: 404 })
		);
	};
}

if (import.meta.main) {
	const server = Bun.serve({
		port: appPort(),
		fetch: createApp(),
	});

	console.log(`Listening on http://localhost:${server.port}`);
}
