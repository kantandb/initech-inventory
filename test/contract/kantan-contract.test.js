import { expect, test } from "bun:test";
import { parse } from "yaml";

const contract = parse(await Bun.file("openapi.yaml").text());
const collection = contract.paths["/db/{database}"];
const document = contract.paths["/db/{database}/{id}"];

test("uses the required OpenAPI 3.2 contract", () => {
	expect(contract.openapi).toBe("3.2.0");
	expect(contract.info.title).toBe("KantanDB HTTP API");
});

test("client operations exist in the contract", () => {
	expect(collection.get.operationId).toBe("listDocuments");
	expect(collection.post.operationId).toBe("createDocument");
	expect(collection.query.operationId).toBe("queryDocuments");
	expect(document.get.operationId).toBe("getDocument");
	expect(document.patch.operationId).toBe("patchDocument");
	expect(document.put.operationId).toBe("replaceDocument");
	expect(document.delete.operationId).toBe("deleteDocument");
});

test("mutation and query media types match the client", () => {
	expect(Object.keys(collection.query.requestBody.content)).toContain(
		"application/json",
	);
	expect(Object.keys(document.patch.requestBody.content)).toContain(
		"application/merge-patch+json",
	);
	expect(Object.keys(document.put.requestBody.content)).toContain(
		"application/json",
	);
	expect(
		document.patch.parameters.some(
			(parameter) => parameter.$ref === "#/components/parameters/IfMatch",
		),
	).toBe(true);
});

test("client page sizes remain inside contract limits", () => {
	const limit = contract.components.parameters.Limit.schema;

	expect(limit.minimum).toBe(1);
	expect(limit.maximum).toBeGreaterThanOrEqual(25);
});
