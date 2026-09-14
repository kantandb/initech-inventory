import { rename } from "node:fs/promises";

const contractUrl =
	"https://raw.githubusercontent.com/kantandb/server-go/main/openapi.yaml";

export async function getContract(
	path = "openapi.yaml",
	force = false,
	fetcher = fetch,
) {
	if (!force && (await Bun.file(path).exists())) {
		return false;
	}

	const response = await fetcher(contractUrl);
	if (!response.ok) {
		throw new Error(`Contract download failed: HTTP ${response.status}`);
	}

	const contract = await response.text();
	if (!contract.trimStart().startsWith("openapi:")) {
		throw new Error("Contract download returned invalid content");
	}

	const temporary = `${path}.${process.pid}.tmp`;
	await Bun.write(temporary, contract);
	await rename(temporary, path);

	return true;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.some((arg) => arg !== "--force")) {
		throw new Error("Usage: bun scripts/openapi.js [--force]");
	}

	const downloaded = await getContract(
		"openapi.yaml",
		args.includes("--force"),
	);
	console.log(
		downloaded ? "Downloaded openapi.yaml" : "Kept existing openapi.yaml",
	);
}
