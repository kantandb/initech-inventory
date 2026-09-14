export function appPort(value = Bun.env.APP_PORT) {
	return Number(value ?? 8081);
}

if (import.meta.main) {
	const server = Bun.serve({
		port: appPort(),
		fetch() {
			return new Response("Initech Inventory\n");
		},
	});

	console.log(`Listening on http://localhost:${server.port}`);
}
