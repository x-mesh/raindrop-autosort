// In-memory stand-ins for the browser APIs the extension modules call.

export function storageArea(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      if (keys === null || keys === undefined) return structuredClone(data);
      if (typeof keys === "string") return keys in data ? { [keys]: structuredClone(data[keys]) } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
      return Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, k in data ? structuredClone(data[k]) : d]));
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete data[k];
    },
  };
}

export function installChrome({ local = {}, sync = {}, granted = [] } = {}) {
  globalThis.chrome = {
    storage: { local: storageArea(local), sync: storageArea(sync) },
    permissions: { contains: async ({ origins }) => origins.every((o) => granted.includes(o)) },
  };
  return globalThis.chrome;
}

// Queue of responses: each entry is a Response, a function (url, init) => Response, or an Error to throw.
export function installFetch(queue) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    const next = queue.shift();
    if (next === undefined) throw new Error(`unexpected fetch ${url}`);
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(url, init) : next;
  };
  return calls;
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
