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

test("GET returns database info and QUERY returns document records", () => {
	expect(
		collection.get.responses["200"].content["application/json"].schema.$ref,
	).toBe("#/components/schemas/DatabaseInfo");
	expect(
		contract.components.schemas.DocumentList.properties.documents.items.$ref,
	).toBe("#/components/schemas/DocumentRecord");
	expect(contract.components.schemas.DocumentRecord.required).toEqual([
		"id",
		"rev",
		"doc",
	]);
	const { schema } = collection.query.requestBody.content["application/json"];
	expect(schema.$ref).toBe("#/components/schemas/PathQuery");
	expect(contract.components.schemas.PathQuery.oneOf).toEqual([
		{ required: ["path", "value"], not: { required: ["index"] } },
		{ required: ["index", "value"], not: { required: ["path"] } },
		{
			not: {
				anyOf: ["index", "path", "op", "value"].map((field) => ({
					required: [field],
				})),
			},
		},
	]);
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
	const limit = contract.components.schemas.PathQuery.properties.limit;

	expect(limit.minimum).toBe(1);
	expect(limit.maximum).toBeGreaterThanOrEqual(25);
});
