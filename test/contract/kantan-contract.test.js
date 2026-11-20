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
	expect(collection.get.operationId).toBe("getDatabase");
	expect(collection.post.operationId).toBe("createDocument");
	expect(collection.query.operationId).toBe("queryDocuments");
	expect(document.get.operationId).toBe("getDocument");
	expect(document.patch.operationId).toBe("patchDocument");
	expect(document.put.operationId).toBe("replaceDocument");
	expect(document.delete.operationId).toBe("deleteDocument");
});

test("GET returns database info and QUERY returns jq records", () => {
	expect(
		collection.get.responses["200"].content["application/json"].schema.$ref,
	).toBe("#/components/schemas/DatabaseInfo");
	const schema =
		collection.query.responses["200"].content["application/json"].schema;
	expect(schema.type).toBe("array");
	expect(schema.items.required).toEqual(["id", "rev", "doc"]);
	expect(schema.items.properties.rev.description).toContain(
		"including its quotes",
	);
	expect(collection.query.responses["200"].headers).toHaveProperty("Cursor");
	expect(collection.query.requestBody.content["text/plain"].schema.type).toBe(
		"string",
	);
});

test("batch imports use the document collection", () => {
	expect(collection.post.requestBody.content).toHaveProperty(
		"application/x-ndjson",
	);
	expect(
		collection.post.responses["200"].content["application/json"].schema.$ref,
	).toBe("#/components/schemas/BulkResult");
	expect(contract.paths).not.toHaveProperty("/bulk/{database}");
});

test("mutation and query media types match the client", () => {
	expect(Object.keys(collection.query.requestBody.content)).toContain(
		"text/plain",
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
	const limit = collection.query.parameters.find(
		({ name }) => name === "Limit",
	).schema;
	const cursor = collection.query.parameters.find(
		({ name }) => name === "Cursor",
	);
	expect(cursor.in).toBe("header");

	expect(limit.minimum).toBe(1);
	expect(limit.maximum).toBeGreaterThanOrEqual(25);
});
