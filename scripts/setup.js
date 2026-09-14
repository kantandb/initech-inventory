import { bootstrap } from "./bootstrap.js";
import { dbHealthy, startDb } from "./db.js";

const url = Bun.env.KANTANDB_URL ?? "http://localhost:8080";
const running = await dbHealthy(url);
const child = running ? null : await startDb();

try {
	const result = await bootstrap({ url });
	console.error(
		result.imported
			? "Populated inventory database"
			: "Inventory database is ready",
	);
} finally {
	if (child) {
		child.kill("SIGTERM");
		await child.exited;
	}
}
