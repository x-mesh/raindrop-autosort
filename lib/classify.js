import { findCollection } from "./raindrop.js";

const TEXT_LIMIT = 600;
const JEV_TIMEOUT_MS = 15_000;
const LINK_TIMEOUT_MS = 5_000;
const LINK_MAX_BYTES = 64 * 1024;
// Same host corrected to the same collection this many times -> suggest a rule.
export const RULE_SUGGEST_MIN = 2;

// Runs inside the target tab via chrome.scripting.executeScript (must be self-contained).
export function extractPageInfo() {
  // SPAs (e.g. Threads) keep the first page's meta tags after client-side navigation: a post opened
  // from the feed still has og:title "Threads • 로그인" and og:url "https://www.threads.com/".
  // When og:url/canonical points at a different path than the current one, ignore all meta tags.
  const declared =
    document.querySelector('meta[property="og:url"]')?.getAttribute("content") ||
    document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  let staleMeta = false;
  if (declared) {
    try {
      const norm = (p) => p.replace(/\/+$/, "") || "/";
      staleMeta = norm(new URL(declared, location.href).pathname) !== norm(location.pathname);
    } catch {
      staleMeta = false;
    }
  }
  const meta = (sel) => (staleMeta ? "" : document.querySelector(sel)?.getAttribute("content")?.trim() || "");
  // `article` first: GitHub READMEs and X posts live there; `main` also holds navigation chrome.
  let root = document.querySelector("article") || document.querySelector("main") || document.body;
  // X virtualizes the thread: once scrolled, the first article is a reply. Use only the focal post
  // (the article whose timestamp links to this status id); the title already carries its text.
  const status = /^(x|twitter)\.com$/.test(location.hostname) && location.pathname.match(/\/status\/(\d+)/);
  if (status) {
    root = [...document.querySelectorAll("article")].find((a) => a.querySelector(`a[href*="/status/${status[1]}"] time`)) || null;
  }
  // Threads has no article/main; the focal post is the pressable container whose timestamp links to this post.
  // Its og:title is only "Threads의 <name>님" (or the stale login title), so title = "@author: <post text>".
  const thread = /(^|\.)threads\.(com|net)$/.test(location.hostname) && location.pathname.match(/^\/(@[^/]+)\/post\/([^/?#]+)/);
  let threadTitle = "";
  if (thread) {
    root =
      [...document.querySelectorAll("[data-pressable-container]")].find((el) =>
        el.querySelector(`a[href*="/post/${thread[2]}"] time`),
      ) || null;
    const postText = staleMeta
      ? document.title
      : document.querySelector('meta[property="og:description"]')?.getAttribute("content") || document.title;
    threadTitle = `${thread[1]}: ${postText}`;
  }
  const text = (root?.innerText || "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    url: location.href,
    title: (threadTitle || meta('meta[property="og:title"]') || document.title).replace(/\s+/g, " ").trim().slice(0, 200),
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    siteName: meta('meta[property="og:site_name"]'),
    selection: String(getSelection() || "").trim().slice(0, 500),
    text: text.slice(0, 2000),
  };
}

export async function readTab(tab) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageInfo });
    if (result) return result;
  } catch {
    // chrome://, Web Store and PDF viewer pages cannot be scripted.
  }
  return { url: tab.url, title: tab.title || tab.url, description: "", siteName: "", selection: "", text: "" };
}

export function linkPage(url, linkText = "") {
  return { url, title: linkText || url, description: "", siteName: "", selection: "", text: "" };
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });

// Service workers have no DOMParser, so the head is read with regexes.
export function parseHtmlMeta(html) {
  const metas = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attr = (name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    const key = attr("property") || attr("name");
    const content = attr("content");
    if (!key || !content) continue;
    const k = (key[2] ?? key[3] ?? key[4]).toLowerCase();
    if (!(k in metas)) metas[k] = decode(content[2] ?? content[3] ?? content[4]).replace(/\s+/g, " ").trim();
  }
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
  return {
    title: (metas["og:title"] || title).slice(0, 200),
    description: metas.description || metas["og:description"] || "",
    siteName: metas["og:site_name"] || "",
  };
}

// Right-click saves only know the link. With `fetchLinkPages` on and the host permission granted,
// read the linked page's head; on any failure keep the link text and say why in `linkError`.
export async function readLink(url, linkText, settings) {
  const base = linkPage(url, linkText);
  if (!settings.fetchLinkPages) return base;
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return { ...base, linkError: "invalid URL" };
  }
  if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) {
    return { ...base, linkError: `no permission for ${origin}` };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LINK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { credentials: "omit", signal: ctrl.signal });
    if (!res.ok) return { ...base, linkError: `HTTP ${res.status}` };
    if (!/text\/html/i.test(res.headers.get("content-type") || "")) return { ...base, linkError: "not HTML" };
    const meta = parseHtmlMeta(await readHead(res));
    return { ...base, title: meta.title || base.title, description: meta.description, siteName: meta.siteName };
  } catch (e) {
    return { ...base, linkError: e.name === "AbortError" ? "timed out" : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function readHead(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < LINK_MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(concat(chunks));
}

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// `host => Collection` or `/regex/flags => Collection`; first match wins; `#` lines are comments.
export function matchRule(rulesText, url, collections) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const line of rulesText.split("\n")) {
    const m = line.match(/^\s*(.+?)\s*=>\s*(.+?)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    const [, pattern, target] = m;
    let hit = false;
    if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
      const end = pattern.lastIndexOf("/");
      try {
        hit = new RegExp(pattern.slice(1, end), pattern.slice(end + 1)).test(url);
      } catch {
        continue;
      }
    } else {
      const p = pattern.replace(/^www\./, "").toLowerCase();
      hit = host === p || host.endsWith(`.${p}`);
    }
    if (!hit) continue;
    const col = findCollection(collections, target);
    if (col) return { collection: col, confidence: 1, reason: `rule: ${pattern}`, source: "rule" };
  }
  return null;
}

// Candidate allowlist from hints. Without hints every collection is a candidate, criterion = its path.
export function buildCandidates(hintsText, collections) {
  const out = [];
  const add = (col, criterion) => {
    let key = col.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `c${col.id}`;
    while (out.some((c) => c.key === key)) key += "_";
    out.push({ key, col, criterion });
  };
  for (const line of hintsText.split("\n")) {
    const m = line.match(/^\s*([^#].*?)\s+:\s+(.+?)\s*$/);
    const col = m && findCollection(collections, m[1]);
    if (col && !out.some((c) => c.col.id === col.id)) add(col, m[2]);
  }
  if (out.length === 0) for (const col of collections) add(col, col.path);
  return out;
}

// `tag : condition` lines -> [{tag, qid, condition}]. Tags are normalized to lowercase-hyphen.
export function parseTagVocab(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([^#\s][^:]*?)\s+:\s+(.+?)\s*$/);
    if (!m) continue;
    const tag = m[1].trim().toLowerCase().replace(/\s+/g, "-");
    if (out.some((t) => t.tag === tag)) continue;
    out.push({ tag, qid: `tag_${out.length}`, condition: m[2] });
  }
  return out;
}

// One Jev request: optional collection `choice` plus one `noul` per tag.
export function buildJevRequest(page, candidates, model, tagVocab = []) {
  const bookmark = { title: page.title, url: page.url };
  if (page.siteName) bookmark.site = page.siteName;
  if (page.description) bookmark.description = page.description.slice(0, TEXT_LIMIT);
  if (page.selection) bookmark.selected_text = page.selection;
  if (page.text) bookmark.page_text = page.text.slice(0, TEXT_LIMIT);
  const questions = {};
  if (candidates) {
    questions.collection = {
      type: "choice",
      instructions:
        "Which collection should this bookmark be filed in? Judge by the main topic of the bookmarked page, not by the site it is hosted on. Apply each collection's exclusions literally.",
      criteria: Object.fromEntries(candidates.map((c) => [c.key, `${c.col.title}: ${c.criterion}`])),
    };
  }
  for (const t of tagVocab) {
    questions[t.qid] = {
      type: "noul",
      instructions: `Does the tag "${t.tag}" apply to the bookmarked page?`,
      criteria: { true: t.condition, false: "The condition above does not clearly apply to the bookmarked page." },
    };
  }
  return {
    model,
    state: { task: "File and tag this saved web bookmark.", bookmark },
    questions,
  };
}

// Tags whose yes-probability clears the threshold, highest first, capped at maxTags.
export function pickTags(answers, tagVocab, threshold, maxTags) {
  return tagVocab
    .map((t) => ({ tag: t.tag, p: answers?.[t.qid]?.noul }))
    .filter((t) => typeof t.p === "number" && t.p >= threshold)
    .sort((a, b) => b.p - a.p)
    .slice(0, maxTags);
}

const isComment = (line) => line.trim().startsWith("#");
const hintName = (line) => line.match(/^\s*(.+?)\s+:(?:\s|$)/)?.[1];

// Appends `path : ` for every collection the hints do not mention yet; the user fills in the criteria.
export function draftHints(hintsText, collections) {
  const listed = new Set();
  for (const line of hintsText.split("\n")) {
    const col = !isComment(line) && hintName(line) && findCollection(collections, hintName(line));
    if (col) listed.add(col.id);
  }
  const added = [...collections]
    .filter((c) => !listed.has(c.id))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((c) => `${c.path} : `);
  return joinLines(hintsText, added);
}

// Appends `tag : ` for existing Raindrop tags missing from the vocabulary, most used first.
export function draftTagVocab(vocabText, tags) {
  const listed = new Set(
    vocabText.split("\n").filter((l) => !isComment(l)).map((l) => hintName(l)?.trim().toLowerCase().replace(/\s+/g, "-")),
  );
  const added = [...tags]
    .sort((a, b) => b.count - a.count)
    .map((t) => t.tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter((t) => t && !listed.has(t) && listed.add(t))
    .map((t) => `${t} : `);
  return joinLines(vocabText, added);
}

function joinLines(text, lines) {
  if (lines.length === 0) return text;
  const head = text.replace(/\s+$/, "");
  return (head ? `${head}\n` : "") + lines.join("\n");
}

// Lines the classifier silently skips, so Options can show them. Line numbers are 1-based.
export function validateSettings(settings, collections) {
  const issues = [];
  const add = (field, line, message) => issues.push({ field, line, message });

  settings.rules.split("\n").forEach((line, i) => {
    if (!line.trim() || isComment(line)) return;
    const m = line.match(/^\s*(.+?)\s*=>\s*(.+?)\s*$/);
    if (!m) return add("rules", i + 1, "expected `<host or /regex/> => <collection>`");
    const [, pattern, target] = m;
    if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
      const end = pattern.lastIndexOf("/");
      try {
        new RegExp(pattern.slice(1, end), pattern.slice(end + 1));
      } catch (e) {
        add("rules", i + 1, `invalid regex: ${e.message}`);
      }
    }
    if (!findCollection(collections, target)) add("rules", i + 1, `no collection named "${target}"`);
  });

  let matched = 0;
  const seen = new Set();
  settings.hints.split("\n").forEach((line, i) => {
    if (!line.trim() || isComment(line)) return;
    const name = hintName(line);
    if (!name) return add("hints", i + 1, "expected `<collection> : <criterion>`");
    const col = findCollection(collections, name);
    if (!col) return add("hints", i + 1, `no collection named "${name}"`);
    if (!/\s:\s+\S/.test(line)) return add("hints", i + 1, `"${name}" has no criterion`);
    if (seen.has(col.id)) return add("hints", i + 1, `"${name}" is listed twice; the first line wins`);
    seen.add(col.id);
    matched++;
  });
  if (matched === 0) add("hints", 0, "no candidate line matched; Jev gets every collection with only its path as the criterion");

  if (settings.autoTags) {
    settings.tagVocab.split("\n").forEach((line, i) => {
      if (!line.trim() || isComment(line)) return;
      if (!/\s:\s+\S/.test(line)) add("tagVocab", i + 1, `"${hintName(line) || line.trim()}" has no condition`);
    });
  }

  if (!findCollection(collections, settings.fallbackCollection)) {
    add("fallbackCollection", 0, `no collection named "${settings.fallbackCollection}"; low-confidence saves go to Unsorted`);
  }
  return issues;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// log: { [host]: { [collection path]: count } }. Returns a new log.
export function recordCorrection(log, url, path) {
  const host = hostOf(url);
  if (!host) return log;
  const counts = { ...log[host] };
  counts[path] = (counts[path] || 0) + 1;
  return { ...log, [host]: counts };
}

// Hosts the user kept moving to one collection, minus hosts an existing rule already covers.
export function suggestRules(log, rulesText, collections, minCount = RULE_SUGGEST_MIN) {
  const out = [];
  for (const [host, counts] of Object.entries(log)) {
    const [top, second] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (top[1] < minCount || (second && second[1] === top[1])) continue;
    if (!findCollection(collections, top[0])) continue;
    if (matchRule(rulesText, `https://${host}/`, collections)) continue;
    out.push({ host, path: top[0], count: top[1], rule: `${host} => ${top[0]}` });
  }
  return out.sort((a, b) => b.count - a.count);
}

async function callJev(settings, body) {
  if (!settings.jevApiKey) throw new Error("Jev API key is not set (Options)");
  const url = settings.jevEndpoint;
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), JEV_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.jevApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if ((res.status === 429 || res.status === 529) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) {
      if (e.name !== "AbortError") throw e;
      // One retry: a second full wait already keeps the popup open for 30 s.
      if (attempt < 1) continue;
      throw new Error(`Jev timed out after ${JEV_TIMEOUT_MS / 1000} s (tried ${attempt + 1} times)`);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function classify(page, collections, settings) {
  const ruled = matchRule(settings.rules, page.url, collections);
  const tagVocab = settings.autoTags ? parseTagVocab(settings.tagVocab) : [];
  // A rule fixes the collection; Jev is still asked for tags if any are configured.
  if (ruled && tagVocab.length === 0) return { ...ruled, tags: [] };

  const fallback =
    findCollection(collections, settings.fallbackCollection) || { id: -1, title: "Unsorted", path: "Unsorted" };
  const candidates = ruled ? null : buildCandidates(settings.hints, collections);
  const t0 = Date.now();
  const res = await callJev(settings, buildJevRequest(page, candidates, settings.jevModel, tagVocab));
  const ms = Date.now() - t0;
  const tags = pickTags(res.answers, tagVocab, settings.tagThreshold, settings.maxTags);
  if (ruled) return { ...ruled, tags, ms, model: res.model };

  const ans = res.answers?.collection;
  const picked = candidates.find((c) => c.key === ans?.choice)?.col;
  const confidence = typeof ans?.confidence === "number" ? ans.confidence : 0;
  const ranked = Object.entries(ans?.probabilities || {}).sort((a, b) => b[1] - a[1]);
  const runnerUp = ranked[1] && candidates.find((c) => c.key === ranked[1][0])?.col;
  const meta = { confidence, runnerUp, runnerUpP: ranked[1]?.[1] ?? 0, ms, model: res.model, tags };

  if (!picked) return { collection: fallback, ...meta, confidence: 0, reason: `no valid choice (${ans?.choice})`, source: "fallback" };
  if (confidence < settings.minConfidence) return { collection: fallback, suggested: picked, ...meta, source: "fallback" };
  return { collection: picked, ...meta, source: "jev" };
}
