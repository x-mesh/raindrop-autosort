import { loadSettings } from "./lib/settings.js";
import { RaindropClient } from "./lib/raindrop.js";
import { classify, readTab, recordCorrection } from "./lib/classify.js";

const $ = (id) => document.getElementById(id);
const AUTO_CLOSE_MS = 900;

let settings, client, page, collections, lastResult;

function setStatus(text, kind = "") {
  $("status").textContent = text;
  $("status").className = kind;
}

function fillCollections(selectedId) {
  const sel = $("collection");
  sel.replaceChildren(
    new Option("Unsorted", "-1"),
    ...[...collections]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((c) => new Option(`${c.path} (${c.count})`, String(c.id))),
  );
  sel.value = String(selectedId ?? -1);
  sel.disabled = false;
}

function describe(r) {
  if (r.source === "rule") {
    const t = r.tags?.length ? ` | tags: ${r.tags.map((x) => `${x.tag} ${x.p.toFixed(2)}`).join(", ")}` : "";
    return `${r.reason}${t}`;
  }
  const parts = [`Jev ${r.confidence.toFixed(2)}`];
  if (r.suggested) parts.push(`below ${settings.minConfidence}, Jev picked "${r.suggested.path}"`);
  if (r.runnerUp) parts.push(`next: ${r.runnerUp.path} ${r.runnerUpP.toFixed(2)}`);
  if (r.reason) parts.push(r.reason);
  if (r.tags?.length) parts.push(`tags: ${r.tags.map((t) => `${t.tag} ${t.p.toFixed(2)}`).join(", ")}`);
  if (r.ms) parts.push(`${r.ms} ms`);
  return parts.join(" | ");
}

async function runClassifier() {
  $("save").disabled = true;
  setStatus("Classifying...");
  try {
    const r = await classify(page, collections, settings);
    lastResult = r;
    fillCollections(r.collection.id);
    // Keep tags the user typed; add Jev's on top.
    const typed = $("tags").value.split(",").map((t) => t.trim()).filter(Boolean);
    $("tags").value = [...new Set([...typed, ...(r.tags || []).map((t) => t.tag)])].join(", ");
    $("reason").textContent = describe(r);
    setStatus("");
  } catch (e) {
    fillCollections($("collection").value || -1);
    setStatus(String(e.message || e), "error");
  } finally {
    $("save").disabled = false;
  }
}

// Remembers when the user overrides Jev, so Options can suggest a rule for that host.
async function rememberCorrection(collectionId) {
  if (!lastResult || lastResult.source === "rule" || lastResult.collection.id === collectionId) return;
  const chosen = collectionId === -1 ? { path: "Unsorted" } : collections.find((c) => c.id === collectionId);
  if (!chosen) return;
  const { corrections = {} } = await chrome.storage.local.get("corrections");
  await chrome.storage.local.set({ corrections: recordCorrection(corrections, page.url, chosen.path) });
}

async function refreshCollections(e) {
  e.preventDefault();
  try {
    collections = await client.collections({ force: true });
    fillCollections(Number($("collection").value));
    setStatus(`${collections.length} collections loaded`);
  } catch (err) {
    setStatus(String(err.message || err), "error");
  }
}

async function checkDuplicate() {
  const box = $("duplicate");
  try {
    const [id] = await client.exists(page.url);
    if (id === undefined) return;
    const item = await client.get(id);
    const col = collections?.find((c) => c.id === item.collection?.$id);
    box.textContent = `Already saved${col ? ` in ${col.path}` : ""}. Saving again creates a second bookmark.`;
  } catch (e) {
    box.textContent = `Duplicate check failed: ${e.message}`;
  }
  box.hidden = false;
}

async function save() {
  $("save").disabled = true;
  setStatus("Saving...");
  try {
    const tags = $("tags").value.split(",").map((t) => t.trim()).filter(Boolean);
    const collectionId = Number($("collection").value);
    await client.create({
      link: page.url,
      title: $("title").value.trim() || page.title,
      excerpt: page.description,
      collectionId,
      tags,
      note: $("note").value.trim(),
    });
    try {
      await rememberCorrection(collectionId);
      setStatus("Saved", "ok");
    } catch (e) {
      setStatus(`Saved (correction not recorded: ${e.message})`, "ok");
    }
    setTimeout(() => window.close(), AUTO_CLOSE_MS);
  } catch (e) {
    setStatus(String(e.message || e), "error");
    $("save").disabled = false;
  }
}

async function init() {
  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  $("save").addEventListener("click", save);
  $("reclassify").addEventListener("click", runClassifier);
  $("refreshCollections").addEventListener("click", refreshCollections);

  settings = await loadSettings();
  client = new RaindropClient(settings);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  page = await readTab(tab);
  $("title").value = page.title;
  $("url").textContent = page.url;
  $("url").title = page.url;

  try {
    collections = await client.collections();
  } catch (e) {
    const hint = e.status === 401 ? " | log in at app.raindrop.io or set a test token in Options" : "";
    setStatus(`${e.message}${hint}`, "error");
    return;
  }
  checkDuplicate();
  await runClassifier();
}

init();
