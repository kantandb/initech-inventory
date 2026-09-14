import { randomBytes } from "node:crypto";
import { chmod, utimes, writeFile } from "node:fs/promises";

export async function ensureKey(path = "kantan.key") {
	try {
		await writeFile(path, `${randomBytes(32).toString("base64")}\n`, {
			flag: "wx",
			mode: 0o600,
		});

		return true;
	} catch (error) {
		if (error.code !== "EEXIST") {
			throw error;
		}

		await chmod(path, 0o600);
		const now = new Date();
		await utimes(path, now, now);

		return false;
	}
}

if (import.meta.main) {
	const created = await ensureKey();
	console.error(created ? "Created kantan.key" : "Kept existing kantan.key");
}
