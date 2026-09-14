import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "test/browser",
	fullyParallel: false,
	workers: 1,
	use: {
		baseURL: "http://127.0.0.1:18081",
		trace: "on-first-retry",
	},
	webServer: {
		command: "bun test/support/browser-server.js",
		url: "http://127.0.0.1:18081",
		timeout: 30_000,
		reuseExistingServer: false,
		stdout: "ignore",
		stderr: "pipe",
	},
});
