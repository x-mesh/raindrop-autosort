import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  buildCandidates,
  buildJevRequest,
  classify,
  draftHints,
  draftTagVocab,
  matchRule,
  parseHtmlMeta,
  parseTagVocab,
  pickTags,
  readLink,
  recordCorrection,
  suggestRules,
  validateSettings,
} from "../lib/classify.js";
import { DEFAULTS } from "../lib/settings.js";
import { installChrome, installFetch, json } from "./stubs.js";

const COLS = [
  { id: 1, title: "Dev", path: "Dev", count: 0 },
  { id: 2, title: "Tools", path: "Dev / Tools", count: 0 },
  { id: 3, title: "Inbox", path: "Inbox", count: 0 },
  { id: 4, title: "Personal", path: "Personal", count: 0 },
];
const PAGE = { url: "https://www.example.com/post", title: "A post", description: "", siteName: "", selection: "", text: "" };
const SETTINGS = {
  ...DEFAULTS,
  jevApiKey: "key",
  rules: "",
  hints: "Dev : software\nPersonal : life\nInbox : unclear",
  autoTags: false,
};
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => installChrome());

test("matchRule: host rules match the domain and its subdomains, ignoring www", () => {
  const rules = "# comment => Dev\nexample.com => Personal";
  assert.equal(matchRule(rules, "https://www.example.com/a", COLS).collection.id, 4);
  assert.equal(matchRule(rules, "https://blog.example.com/a", COLS).collection.id, 4);
  assert.equal(matchRule(rules, "https://notexample.com/a", COLS), null);
});

test("matchRule: regex rules, first match wins, unknown targets and bad regexes are skipped", () => {
  const rules = "/github\\.com\\/a/i => Nope\n/([/ => Dev\n/GITHUB\\.com/i => Dev / Tools\ngithub.com => Personal";
  const hit = matchRule(rules, "https://github.com/a/b", COLS);
  assert.equal(hit.collection.id, 2);
  assert.equal(hit.source, "rule");
  assert.equal(hit.confidence, 1);
  assert.equal(matchRule(rules, "not a url", COLS), null);
});

test("buildCandidates keeps listed collections once, with unique keys", () => {
  const cands = buildCandidates("Dev : code\n# Personal : skip\ndev : again\nTools : tools\nMissing : x", COLS);
  assert.deepEqual(
    cands.map((c) => [c.key, c.col.id, c.criterion]),
    [
      ["dev", 1, "code"],
      ["tools", 2, "tools"],
    ],
  );
});

test("buildCandidates offers every collection by path when no hint matches", () => {
  const cands = buildCandidates("Nothing : here", [...COLS, { id: 5, title: "dev", path: "Other / dev" }]);
  assert.equal(cands.length, 5);
  assert.deepEqual(cands.at(-1), { key: "dev_", col: { id: 5, title: "dev", path: "Other / dev" }, criterion: "Other / dev" });
});

test("parseTagVocab normalizes tags and drops duplicates and comments", () => {
  assert.deepEqual(parseTagVocab("Claude Code : about it\n# x : y\nclaude-code : dup\nbad line\nrag : retrieval"), [
    { tag: "claude-code", qid: "tag_0", condition: "about it" },
    { tag: "rag", qid: "tag_1", condition: "retrieval" },
  ]);
});

test("buildJevRequest trims page text and adds one noul question per tag", () => {
  const page = { ...PAGE, siteName: "Ex", description: "d".repeat(700), selection: "sel", text: "t".repeat(700) };
  const req = buildJevRequest(page, buildCandidates(SETTINGS.hints, COLS), "jev-x", parseTagVocab("mcp : protocol"));
  assert.equal(req.model, "jev-x");
  assert.equal(req.state.bookmark.description.length, 600);
  assert.equal(req.state.bookmark.page_text.length, 600);
  assert.equal(req.state.bookmark.site, "Ex");
  assert.equal(req.state.bookmark.selected_text, "sel");
  assert.equal(req.questions.collection.type, "choice");
  assert.equal(req.questions.collection.criteria.dev, "Dev: software");
  assert.equal(req.questions.tag_0.type, "noul");
  assert.equal(req.questions.tag_0.criteria.true, "protocol");
});

test("buildJevRequest without candidates asks for tags only", () => {
  const req = buildJevRequest(PAGE, null, "m", parseTagVocab("mcp : protocol"));
  assert.deepEqual(Object.keys(req.questions), ["tag_0"]);
  assert.equal(req.state.bookmark.site, undefined);
});

test("pickTags applies the threshold, sorts by probability and caps the count", () => {
  const vocab = parseTagVocab("a : 1\nb : 2\nc : 3\nd : 4");
  const answers = { tag_0: { noul: 0.71 }, tag_1: { noul: 0.95 }, tag_2: { noul: 0.4 }, tag_3: { noul: 0.8 } };
  assert.deepEqual(pickTags(answers, vocab, 0.7, 2), [
    { tag: "b", p: 0.95 },
    { tag: "d", p: 0.8 },
  ]);
  assert.deepEqual(pickTags(undefined, vocab, 0.7, 2), []);
});

const jevAnswer = (collection, extra = {}) => json({ model: "jev-1", answers: { collection, ...extra } });

test("classify: a rule without tags skips Jev", async () => {
  installFetch([]);
  const r = await classify(PAGE, COLS, { ...SETTINGS, rules: "example.com => Personal" });
  assert.equal(r.collection.id, 4);
  assert.deepEqual(r.tags, []);
});

test("classify: a rule with tags asks Jev for tags only", async () => {
  const calls = installFetch([json({ model: "jev-1", answers: { tag_0: { noul: 0.9 } } })]);
  const r = await classify(PAGE, COLS, { ...SETTINGS, rules: "example.com => Personal", autoTags: true, tagVocab: "mcp : p" });
  assert.equal(r.source, "rule");
  assert.deepEqual(r.tags, [{ tag: "mcp", p: 0.9 }]);
  assert.equal(calls[0].body.questions.collection, undefined);
  assert.equal(calls[0].init.headers.Authorization, "Bearer key");
});

test("classify: a confident pick is used, with the runner-up", async () => {
  installFetch([jevAnswer({ choice: "dev", confidence: 0.9, probabilities: { dev: 0.9, personal: 0.08, inbox: 0.02 } })]);
  const r = await classify(PAGE, COLS, SETTINGS);
  assert.equal(r.source, "jev");
  assert.equal(r.collection.id, 1);
  assert.equal(r.runnerUp.id, 4);
  assert.equal(r.runnerUpP, 0.08);
  assert.equal(r.model, "jev-1");
});

test("classify: a pick below the threshold goes to the fallback and keeps the suggestion", async () => {
  installFetch([jevAnswer({ choice: "dev", confidence: 0.5, probabilities: { dev: 0.5 } })]);
  const r = await classify(PAGE, COLS, SETTINGS);
  assert.equal(r.source, "fallback");
  assert.equal(r.collection.id, 3);
  assert.equal(r.suggested.id, 1);
});

test("classify: an unknown choice goes to the fallback with confidence 0", async () => {
  installFetch([jevAnswer({ choice: "nope", confidence: 0.99 })]);
  const r = await classify(PAGE, COLS, SETTINGS);
  assert.equal(r.collection.id, 3);
  assert.equal(r.confidence, 0);
  assert.match(r.reason, /no valid choice \(nope\)/);
});

test("classify: a missing fallback collection means Unsorted", async () => {
  installFetch([jevAnswer({ choice: "dev", confidence: 0.1 })]);
  const r = await classify(PAGE, COLS, { ...SETTINGS, fallbackCollection: "Gone" });
  assert.equal(r.collection.id, -1);
});

test("classify: no API key fails before any request", async () => {
  installFetch([]);
  await assert.rejects(classify(PAGE, COLS, { ...SETTINGS, jevApiKey: "" }), /Jev API key is not set/);
});

test("classify: 429 is retried, other HTTP errors are reported", async () => {
  installFetch([new Response("busy", { status: 429 }), jevAnswer({ choice: "dev", confidence: 0.9 })]);
  assert.equal((await classify(PAGE, COLS, SETTINGS)).collection.id, 1);
  installFetch([new Response("bad input", { status: 400 })]);
  await assert.rejects(classify(PAGE, COLS, SETTINGS), /Jev HTTP 400: bad input/);
});

test("classify: a timeout is retried once, then reported in plain words", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const hang = (_url, init) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const calls = installFetch([hang, hang]);
  const done = assert.rejects(classify(PAGE, COLS, SETTINGS), /Jev timed out after 15 s \(tried 2 times\)/);
  t.mock.timers.tick(15_000);
  await flush();
  assert.equal(calls.length, 2);
  t.mock.timers.tick(15_000);
  await done;
});

test("draftHints appends only collections the hints do not mention", () => {
  const out = draftHints("Dev : code\n# Personal : x\nInbox :\n", COLS);
  assert.equal(out, "Dev : code\n# Personal : x\nInbox :\nDev / Tools : \nPersonal : ");
  assert.equal(draftHints(out, COLS), out);
  assert.equal(draftHints("", COLS.slice(0, 1)), "Dev : ");
});

test("draftTagVocab appends missing tags, normalized, most used first", () => {
  const tags = [
    { tag: "Rare", count: 1 },
    { tag: "Machine Learning", count: 9 },
    { tag: "mcp", count: 5 },
    { tag: "machine learning", count: 2 },
  ];
  assert.equal(draftTagVocab("mcp : protocol", tags), "mcp : protocol\nmachine-learning : \nrare : ");
  assert.equal(draftTagVocab("x : y", []), "x : y");
});

test("validateSettings reports lines the classifier would skip", () => {
  const issues = validateSettings(
    {
      ...SETTINGS,
      rules: "# ok\nexample.com => Dev\nno arrow\n/([/ => Dev\nfoo.com => Missing",
      hints: "Dev : code\nMissing : x\nPersonal :\nDev : twice\nno colon here",
      autoTags: true,
      tagVocab: "mcp : protocol\nrag :",
      fallbackCollection: "Gone",
    },
    COLS,
  );
  assert.deepEqual(
    issues.map((i) => [i.field, i.line]),
    [
      ["rules", 3],
      ["rules", 4],
      ["rules", 5],
      ["hints", 2],
      ["hints", 3],
      ["hints", 4],
      ["hints", 5],
      ["tagVocab", 2],
      ["fallbackCollection", 0],
    ],
  );
  assert.match(issues[1].message, /invalid regex/);
  assert.match(issues.at(-1).message, /Unsorted/);
});

test("validateSettings warns when no hint matches and is quiet for good settings", () => {
  const none = validateSettings({ ...SETTINGS, hints: "Missing : x" }, COLS);
  assert.ok(none.some((i) => i.field === "hints" && i.line === 0));
  assert.deepEqual(validateSettings(SETTINGS, COLS), []);
});

test("recordCorrection counts per host and collection without mutating the log", () => {
  const a = recordCorrection({}, "https://www.example.com/x", "Dev");
  const b = recordCorrection(a, "https://example.com/y", "Dev");
  assert.deepEqual(a, { "example.com": { Dev: 1 } });
  assert.deepEqual(b, { "example.com": { Dev: 2 } });
  assert.equal(recordCorrection(b, "not a url", "Dev"), b);
});

test("suggestRules needs repeated, unambiguous corrections not covered by a rule", () => {
  const log = {
    "a.com": { Dev: 2 },
    "b.com": { Dev: 1 },
    "c.com": { Dev: 2, Personal: 2 },
    "d.com": { Personal: 3 },
    "e.com": { Gone: 5 },
  };
  assert.deepEqual(suggestRules(log, "d.com => Personal", COLS), [{ host: "a.com", path: "Dev", count: 2, rule: "a.com => Dev" }]);
});

test("parseHtmlMeta prefers og tags, decodes entities and handles attribute order", () => {
  const html = `<head><title> Plain &amp; title </title>
    <meta content='Desc &#39;q&#39;' name="description">
    <meta property="og:title" content="OG &lt;b&gt; &#x1F600;">
    <meta property=og:site_name content=Site>
    <meta name="description" content="second">`;
  assert.deepEqual(parseHtmlMeta(html), { title: "OG <b> 😀", description: "Desc 'q'", siteName: "Site" });
  assert.deepEqual(parseHtmlMeta("<title>Only</title>"), { title: "Only", description: "", siteName: "" });
});

test("readLink keeps the link text when fetching is off or not permitted", async () => {
  installFetch([]);
  const off = await readLink("https://a.example/p", "Link", { fetchLinkPages: false });
  assert.equal(off.title, "Link");
  assert.equal(off.linkError, undefined);
  const denied = await readLink("https://a.example/p", "", { fetchLinkPages: true });
  assert.equal(denied.title, "https://a.example/p");
  assert.match(denied.linkError, /no permission for https:\/\/a\.example/);
});

test("readLink reads the head of an HTML page without cookies", async () => {
  installChrome({ granted: ["https://a.example/*"] });
  const html = `<html><head><title>T</title><meta name="description" content="D"></head><body>${"x".repeat(200_000)}</body>`;
  const calls = installFetch([new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })]);
  const page = await readLink("https://a.example/p", "Link", { fetchLinkPages: true });
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(page.title, "T");
  assert.equal(page.description, "D");
  assert.equal(page.url, "https://a.example/p");
});

test("readLink reports non-HTML, HTTP and network failures", async () => {
  installChrome({ granted: ["https://a.example/*"] });
  const s = { fetchLinkPages: true };
  installFetch([new Response("{}", { headers: { "content-type": "application/json" } })]);
  assert.equal((await readLink("https://a.example/p", "L", s)).linkError, "not HTML");
  installFetch([new Response("", { status: 404 })]);
  assert.equal((await readLink("https://a.example/p", "L", s)).linkError, "HTTP 404");
  installFetch([new TypeError("Failed to fetch")]);
  const page = await readLink("https://a.example/p", "L", s);
  assert.equal(page.linkError, "Failed to fetch");
  assert.equal(page.title, "L");
});
