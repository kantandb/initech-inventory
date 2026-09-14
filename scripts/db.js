import { mkdir } from "node:fs/promises";

export const dbArgs = [
	"./kantan",
	"-addr",
	":8080",
	"-data",
	"data",
	"-key-file",
	"kantan.key",
	"-bulk-max-documents",
	"5250",
];

export async function dbHealthy(url = "http://localhost:8080") {
	try {
		return (await fetch(`${url}/healthz`)).ok;
	} catch {
		return false;
	}
}

export async function startDb() {
	await mkdir("data", { recursive: true });

	return Bun.spawn(dbArgs, { stdout: "inherit", stderr: "inherit" });
}

if (import.meta.main) {
	if (await dbHealthy(Bun.env.KANTANDB_URL)) {
		console.error("KantanDB is already running");
	} else {
		const child = await startDb();
		for (const signal of ["SIGINT", "SIGTERM"]) {
			process.on(signal, () => child.kill(signal));
		}

		process.exitCode = await child.exited;
	}
}
