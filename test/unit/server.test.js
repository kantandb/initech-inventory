import { describe, expect, test } from "bun:test";
import { appPort } from "../../src/server.js";

describe("appPort", () => {
	test("uses the configured port", () => {
		expect(appPort("4000")).toBe(4000);
	});

	test("defaults to port 8081", () => {
		expect(appPort(undefined)).toBe(8081);
	});
});
