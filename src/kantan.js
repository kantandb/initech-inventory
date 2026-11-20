export class KantanError extends Error {
	constructor(status, body) {
		super(
			body?.error?.message ?? `KantanDB request failed with HTTP ${status}`,
		);
		this.name = "KantanError";
		this.status = status;
		this.body = body;
	}
}

export class KantanClient {
	constructor({
		url = Bun.env.KANTANDB_URL ?? "http://localhost:8080",
		database = Bun.env.KANTANDB_DATABASE ?? "inventory",
		fetcher = fetch,
	} = {}) {
		this.url = url.replace(/\/$/, "");
		this.database = database;
		this.fetcher = fetcher;
	}

	collection(suffix = "") {
		return `/db/${encodeURIComponent(this.database)}${suffix}`;
	}

	async request(path, init = {}) {
		const response = await this.fetcher(`${this.url}${path}`, init);
		if (!response.ok) {
			let body;
			try {
				body = await response.json();
			} catch {
				body = null;
			}

			throw new KantanError(response.status, body);
		}

		return response;
	}

	async list({ limit = 25, cursor } = {}) {
		return this.query({ limit, cursor });
	}

	async read(id) {
		const response = await this.request(
			this.collection(`/${encodeURIComponent(id)}`),
		);

		return {
			id,
			etag: response.headers.get("etag"),
			item: await response.json(),
		};
	}

	async create(item) {
		const response = await this.request(this.collection(), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(item),
		});
		const { id } = await response.json();

		return { id, etag: response.headers.get("etag"), item };
	}

	async patch(id, patch, etag) {
		const response = await this.request(
			this.collection(`/${encodeURIComponent(id)}`),
			{
				method: "PATCH",
				headers: {
					"content-type": "application/merge-patch+json",
					"if-match": etag,
				},
				body: JSON.stringify(patch),
			},
		);

		return {
			id,
			etag: response.headers.get("etag"),
			item: await response.json(),
		};
	}

	async replace(id, item, etag) {
		const response = await this.request(
			this.collection(`/${encodeURIComponent(id)}`),
			{
				method: "PUT",
				headers: { "content-type": "application/json", "if-match": etag },
				body: JSON.stringify(item),
			},
		);

		return {
			id,
			etag: response.headers.get("etag"),
			item: await response.json(),
		};
	}

	async query({ program = ".", limit = 25, cursor } = {}) {
		const headers = {
			"content-type": "text/plain",
			accept: "application/json",
			limit: String(limit),
		};
		if (cursor) headers.cursor = cursor;
		const response = await this.request(this.collection(), {
			method: "QUERY",
			headers,
			body: program,
		});

		return {
			documents: await response.json(),
			cursor: response.headers.get("cursor") ?? "",
		};
	}

	async delete(id, etag) {
		await this.request(this.collection(`/${encodeURIComponent(id)}`), {
			method: "DELETE",
			headers: { "if-match": etag },
		});
	}
}
