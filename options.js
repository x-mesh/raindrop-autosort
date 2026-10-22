import { DEFAULTS, loadSettings, saveSettings } from "./lib/settings.js";
import { RaindropClient } from "./lib/raindrop.js";
import { buildCandidates, classify, draftHints, draftTagVocab, suggestRules, validateSettings } from "./lib/classify.js";

const $ = (id) => document.getElementById(id);
const FIELDS = Object.keys(DEFAULTS);
const MANIFEST_ORIGINS = ["https://api.typesafe.ai"];
const LINK_ORIGINS = ["http://*/*", "https://*/*"];
const FIELD_LABELS = { rules: "Rules", hints: "Jev candidates", tagVocab: "Tag vocabulary", fallbackCollection: "Fallback" };

function setStatus(text, kind = "") {
  $("status").textContent = text;
  $("status").className = kind;
}

function read() {
  const out = {};
  for (const k of FIELDS) {
    const el = $(k);
    out[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value.trim();
  }
  return out;
}

function write(s) {
  for (const k of FIELDS) {
    if ($(k).type === "checkbox") $(k).checked = Boolean(s[k]);
    else $(k).value = s[k];
  }
  $("tokenRow").hidden = s.authMode !== "token";
}

// Origins in MANIFEST_ORIGINS are granted at install; any other Jev endpoint host needs a runtime grant.
async function ensureJevPermission(endpoint) {
  let origin;
  try {
    origin = new URL(endpoint).origin;
  } catch {
    throw new Error("Jev endpoint is not a valid URL");
  }
  if (MANIFEST_ORIGINS.includes(origin)) return;
  const ok = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!ok) throw new Error(`Permission for ${origin} was denied`);
}

function renderReport(issues, suggestions) {
  const report = $("report");
  report.replaceChildren();
  if (issues.length) {
    const ul = document.createElement("ul");
    for (const i of issues) {
      const li = document.createElement("li");
      li.className = "warn";
      li.textContent = `${FIELD_LABELS[i.field]}${i.line ? ` line ${i.line}` : ""}: ${i.message}`;
      ul.append(li);
    }
    report.append(heading(`Settings issues (${issues.length})`), ul);
  }
  if (suggestions.length) {
    const ul = document.createElement("ul");
    for (const sug of suggestions) {
      const li = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = sug.rule;
      const add = document.createElement("button");
      add.type = "button";
      add.className = "secondary";
      add.textContent = "Add";
      add.addEventListener("click", () => {
        $("rules").value = [$("rules").value.replace(/\s+$/, ""), sug.rule].filter(Boolean).join("\n");
        li.remove();
        setStatus("Rule added. Save to apply.");
      });
      li.append(code, ` moved there ${sug.count} times`, add);
      ul.append(li);
    }
    report.append(heading("Suggested rules from your corrections"), ul);
  }
}

function heading(text) {
  const h = document.createElement("h2");
  h.textContent = text;
  return h;
}

async function refreshReport(s, cols) {
  const { corrections = {} } = await chrome.storage.local.get("corrections");
  renderReport(validateSettings(s, cols), suggestRules(corrections, s.rules, cols));
}

async function draft(field, load, merge) {
  try {
    const client = new RaindropClient(read());
    const before = $(field).value;
    $(field).value = merge(before, await load(client));
    setStatus($(field).value === before ? "Nothing to add" : "Lines added at the end. Fill in the text after each colon, then Save.");
  } catch (e) {
    setStatus(String(e.message || e), "error");
  }
}

async function save() {
  const s = read();
  try {
    await ensureJevPermission(s.jevEndpoint);
    if (s.fetchLinkPages && !(await chrome.permissions.contains({ origins: LINK_ORIGINS }))) {
      throw new Error('"Read the linked page" needs access to all sites; turn it off and on again to grant it');
    }
    await saveSettings(s);
    // Drop cached collections; they are keyed by auth mode.
    const keys = Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith("collections:"));
    await chrome.storage.local.remove(keys);
    setStatus("Saved", "ok");
  } catch (e) {
    setStatus(String(e.message || e), "error");
  }
}

// Real round trip: list collections, then classify a fixed sample bookmark with Jev.
async function test() {
  const s = read();
  const lines = [];
  let cols = null;
  try {
    cols = await new RaindropClient(s).collections({ force: true });
    lines.push(`Raindrop OK: ${cols.length} collections, ${buildCandidates(s.hints, cols).length} Jev candidates`);
  } catch (e) {
    lines.push(`Raindrop failed: ${e.message}`);
  }
  if (cols) {
    try {
      await ensureJevPermission(s.jevEndpoint);
      const sample = {
        url: "https://github.com/modelcontextprotocol/servers",
        title: "modelcontextprotocol/servers: Model Context Protocol Servers",
        description: "Reference implementations of MCP servers for AI agents",
        siteName: "GitHub",
        selection: "",
        text: "",
      };
      const r = await classify(sample, cols, { ...s, rules: "" });
      const tags = r.tags?.length ? `, tags ${r.tags.map((t) => t.tag).join("/")}` : "";
      lines.push(`Jev OK: sample -> ${(r.suggested || r.collection).path} (${r.confidence.toFixed(2)}${tags}, ${r.ms} ms, ${r.model})`);
    } catch (e) {
      lines.push(`Jev failed: ${e.message}`);
    }
  }
  setStatus(lines.join(" | "), lines.every((l) => l.includes("OK")) ? "ok" : "error");
  if (cols) await refreshReport(s, cols);
}

$("version").textContent = `v${chrome.runtime.getManifest().version}`;
$("authMode").addEventListener("change", () => ($("tokenRow").hidden = $("authMode").value !== "token"));
$("save").addEventListener("click", save);
$("test").addEventListener("click", test);
$("draftHints").addEventListener("click", () => draft("hints", (c) => c.collections({ force: true }), draftHints));
$("draftTags").addEventListener("click", () => draft("tagVocab", (c) => c.tags(), draftTagVocab));
// permissions.request must run directly in the gesture handler, before any other await.
$("fetchLinkPages").addEventListener("change", async (e) => {
  if (!e.target.checked) {
    await chrome.permissions.remove({ origins: LINK_ORIGINS });
    return;
  }
  if (!(await chrome.permissions.request({ origins: LINK_ORIGINS }))) {
    e.target.checked = false;
    setStatus("Access to all sites was denied", "error");
  }
});

loadSettings().then(async (s) => {
  write(s);
  try {
    await refreshReport(s, await new RaindropClient(s).collections());
  } catch (e) {
    setStatus(`Could not check settings: ${e.message}`, "error");
  }
});
