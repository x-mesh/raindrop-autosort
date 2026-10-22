// Two auth paths:
// - session: https://api.raindrop.io/v1/* with the browser's Raindrop login cookie
//   (this is what app.raindrop.io itself calls; verified for GET on 2026-10-21).
//   /tags and /import/url/exists are documented for rest/v1 only; their session-mode support is unverified.
// - token:   https://api.raindrop.io/rest/v1/* with `Authorization: Bearer <test token>` (official docs).

const SESSION_BASE = "https://api.raindrop.io/v1";
const TOKEN_BASE = "https://api.raindrop.io/rest/v1";
const COLLECTION_CACHE_MS = 10 * 60 * 1000;

export class RaindropClient {
  constructor({ authMode, token }) {
    this.mode = authMode === "token" && token ? "token" : "session";
    this.base = this.mode === "token" ? TOKEN_BASE : SESSION_BASE;
    this.token = token;
  }

  // `falseIsEmpty`: /import/url/exists answers "no match" with `result: false`, which is not an error.
  async call(method, path, body, { falseIsEmpty = false } = {}) {
    const init = { method, headers: {} };
    if (this.mode === "token") init.headers.Authorization = `Bearer ${this.token}`;
    else init.credentials = "include";
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(this.base + path, init);
    const data = await res.json().catch(() => null);
    // The internal API answers some errors with HTTP 200 and `result: false`.
    const emptyMatch = falseIsEmpty && Array.isArray(data?.ids) && !data.errorMessage;
    if (!res.ok || !data || (data.result === false && !emptyMatch)) {
      const msg = data?.errorMessage || `HTTP ${res.status}`;
      const err = new Error(`Raindrop ${method} ${path}: ${msg}`);
      err.status = data?.status || res.status;
      throw err;
    }
    return data;
  }

  async collections({ force = false } = {}) {
    const cacheKey = `collections:${this.mode}`;
    if (!force) {
      const cached = (await chrome.storage.local.get(cacheKey))[cacheKey];
      if (cached && Date.now() - cached.at < COLLECTION_CACHE_MS) return cached.items;
    }
    let raw;
    if (this.mode === "session") {
      raw = (await this.call("GET", "/collections/all")).items;
    } else {
      const [root, children] = await Promise.all([
        this.call("GET", "/collections"),
        this.call("GET", "/collections/childrens"),
      ]);
      raw = [...root.items, ...children.items];
    }
    const items = withPaths(raw);
    await chrome.storage.local.set({ [cacheKey]: { at: Date.now(), items } });
    return items;
  }

  async tags() {
    return (await this.call("GET", "/tags")).items.map((t) => ({ tag: t._id, count: t.count ?? 0 }));
  }

  // Ids of bookmarks already saved with this URL (Raindrop normalizes the URL).
  async exists(url) {
    return (await this.call("POST", "/import/url/exists", { urls: [url] }, { falseIsEmpty: true })).ids || [];
  }

  async get(id) {
    return (await this.call("GET", `/raindrop/${id}`)).item;
  }

  async create({ link, title, excerpt, collectionId, tags, note }) {
    const body = { link, title, pleaseParse: {}, collection: { $id: collectionId } };
    if (excerpt) body.excerpt = excerpt;
    if (tags?.length) body.tags = tags;
    if (note) body.note = note;
    return (await this.call("POST", "/raindrop", body)).item;
  }
}

export function withPaths(raw) {
  const byId = new Map(raw.map((c) => [c._id, c]));
  const pathOf = (c, seen = new Set()) => {
    const parentId = c.parent?.$id;
    if (!parentId || !byId.has(parentId) || seen.has(c._id)) return c.title;
    seen.add(c._id);
    return `${pathOf(byId.get(parentId), seen)} / ${c.title}`;
  };
  return raw.map((c) => ({ id: c._id, title: c.title, path: pathOf(c), count: c.count ?? 0 }));
}

// Title or "Parent / Child" path -> collection. -1 is Raindrop's built-in Unsorted.
export function findCollection(collections, name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (key === "unsorted") return { id: -1, title: "Unsorted", path: "Unsorted" };
  return (
    collections.find((c) => c.path.toLowerCase() === key) ||
    collections.find((c) => c.title.toLowerCase() === key) ||
    null
  );
}
