import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { RaindropClient, findCollection, withPaths } from "../lib/raindrop.js";
import { DEFAULTS, loadSettings, saveSettings } from "../lib/settings.js";
import { installChrome, installFetch, json } from "./stubs.js";

const RAW = [
  { _id: 1, title: "Dev", count: 3 },
  { _id: 2, title: "Tools", parent: { $id: 1 }, count: 5 },
  { _id: 3, title: "Orphan", parent: { $id: 99 } },
];

beforeEach(() => installChrome());

test("withPaths builds parent paths and tolerates missing parents", () => {
  assert.deepEqual(withPaths(RAW), [
    { id: 1, title: "Dev", path: "Dev", count: 3 },
    { id: 2, title: "Tools", path: "Dev / Tools", count: 5 },
    { id: 3, title: "Orphan", path: "Orphan", count: 0 },
  ]);
});

test("withPaths stops on a parent cycle", () => {
  const cols = withPaths([
    { _id: 1, title: "A", parent: { $id: 2 } },
    { _id: 2, title: "B", parent: { $id: 1 } },
  ]);
  assert.equal(cols.length, 2);
  assert.ok(cols.every((c) => typeof c.path === "string"));
});

test("findCollection matches path first, then title, case-insensitive", () => {
  const cols = withPaths(RAW);
  assert.equal(findCollection(cols, "dev / tools").id, 2);
  assert.equal(findCollection(cols, " TOOLS ").id, 2);
  assert.deepEqual(findCollection(cols, "Unsorted"), { id: -1, title: "Unsorted", path: "Unsorted" });
  assert.equal(findCollection(cols, "missing"), null);
  assert.equal(findCollection(cols, ""), null);
});

test("session mode sends cookies to the internal API", async () => {
  const calls = installFetch([json({ result: true, items: RAW })]);
  const items = await new RaindropClient({ authMode: "session" }).collections();
  assert.equal(calls[0].url, "https://api.raindrop.io/v1/collections/all");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(items[1].path, "Dev / Tools");
});

test("token mode uses the REST API with a bearer token and merges root and child collections", async () => {
  const calls = installFetch([json({ result: true, items: [RAW[0]] }), json({ result: true, items: [RAW[1]] })]);
  const items = await new RaindropClient({ authMode: "token", token: "t0k" }).collections();
  assert.deepEqual(calls.map((c) => c.url).sort(), [
    "https://api.raindrop.io/rest/v1/collections",
    "https://api.raindrop.io/rest/v1/collections/childrens",
  ]);
  assert.equal(calls[0].init.headers.Authorization, "Bearer t0k");
  assert.deepEqual(items.map((c) => c.path), ["Dev", "Dev / Tools"]);
});

test("token mode without a token falls back to session mode", () => {
  assert.equal(new RaindropClient({ authMode: "token", token: "" }).mode, "session");
});

test("collections are cached per auth mode until forced", async () => {
  const calls = installFetch([json({ result: true, items: RAW }), json({ result: true, items: [RAW[0]] })]);
  const client = new RaindropClient({ authMode: "session" });
  await client.collections();
  assert.equal((await client.collections()).length, 3);
  assert.equal(calls.length, 1);
  assert.equal((await client.collections({ force: true })).length, 1);
  assert.equal(calls.length, 2);
  assert.ok("collections:session" in chrome.storage.local.data);
});

test("result:false with HTTP 200 is an error that carries the status", async () => {
  installFetch([json({ result: false, errorMessage: "not logged in", status: 401 })]);
  await assert.rejects(new RaindropClient({}).collections(), (e) => {
    assert.match(e.message, /Raindrop GET \/collections\/all: not logged in/);
    assert.equal(e.status, 401);
    return true;
  });
});

test("a non-JSON error body reports the HTTP status", async () => {
  installFetch([new Response("<html>", { status: 502 })]);
  await assert.rejects(new RaindropClient({}).collections(), /HTTP 502/);
});

test("exists returns ids, and result:false means no match rather than an error", async () => {
  const calls = installFetch([json({ result: true, ids: [7] }), json({ result: false, ids: [] })]);
  const client = new RaindropClient({});
  assert.deepEqual(await client.exists("https://a.example/"), [7]);
  assert.deepEqual(await client.exists("https://b.example/"), []);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].url, "https://api.raindrop.io/v1/import/url/exists");
  assert.deepEqual(calls[0].body, { urls: ["https://a.example/"] });
});

test("exists still rejects result:false that carries an error", async () => {
  installFetch([json({ result: false, errorMessage: "unauthorized", status: 401 })]);
  await assert.rejects(new RaindropClient({}).exists("https://a.example/"), /unauthorized/);
});

test("tags maps Raindrop tag items", async () => {
  installFetch([json({ result: true, items: [{ _id: "mcp", count: 4 }, { _id: "rag" }] })]);
  assert.deepEqual(await new RaindropClient({}).tags(), [
    { tag: "mcp", count: 4 },
    { tag: "rag", count: 0 },
  ]);
});

test("create sends only the fields that are set", async () => {
  const calls = installFetch([json({ result: true, item: { _id: 9 } })]);
  const item = await new RaindropClient({}).create({ link: "https://x.example/", title: "X", collectionId: 2, tags: [] });
  assert.deepEqual(item, { _id: 9 });
  assert.deepEqual(calls[0].body, { link: "https://x.example/", title: "X", pleaseParse: {}, collection: { $id: 2 } });
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
});

test("secrets go to storage.local and everything else to storage.sync", async () => {
  await saveSettings({ ...DEFAULTS, token: "t", jevApiKey: "k", minConfidence: 0.5 });
  assert.equal(chrome.storage.local.data.jevApiKey, "k");
  assert.equal(chrome.storage.local.data.token, "t");
  assert.equal(chrome.storage.sync.data.jevApiKey, undefined);
  assert.equal(chrome.storage.sync.data.minConfidence, 0.5);
  const loaded = await loadSettings();
  assert.equal(loaded.jevApiKey, "k");
  assert.equal(loaded.minConfidence, 0.5);
});

test("loadSettings fills defaults for unset keys", async () => {
  const s = await loadSettings();
  assert.deepEqual(s, DEFAULTS);
  assert.equal(s.fetchLinkPages, false);
});
