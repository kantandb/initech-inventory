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

	async list({ limit = 25, cursor, index, op, value } = {}) {
		const params = new URLSearchParams({ limit: String(limit) });
		if (cursor) params.set("cursor", cursor);
		if (index) {
			params.set("index", index);
			params.set("value", JSON.stringify(value));
			if (op) params.set("op", op);
		}

		const response = await this.request(`${this.collection()}?${params}`);

		return response.json();
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

	async query({ path, value, op, limit = 25, cursor } = {}) {
		const body = { path, value, limit };
		if (op) body.op = op;
		if (cursor) body.cursor = cursor;
		const response = await this.request(this.collection(), {
			method: "QUERY",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});

		return response.json();
	}

	async delete(id, etag) {
		await this.request(this.collection(`/${encodeURIComponent(id)}`), {
			method: "DELETE",
			headers: { "if-match": etag },
		});
	}
}
