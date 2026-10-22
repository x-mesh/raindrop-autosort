import { loadSettings } from "./lib/settings.js";
import { RaindropClient } from "./lib/raindrop.js";
import { classify, readLink, readTab } from "./lib/classify.js";

const BADGE_CLEAR_MS = 4000;

async function flash(tabId, text, color, title) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setTitle({ tabId, title });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {}), BADGE_CLEAR_MS);
}

async function autoSave(tab, page) {
  const settings = await loadSettings();
  const client = new RaindropClient(settings);
  try {
    await flash(tab.id, "...", "#6b7280", "Classifying");
    // Quick saves skip URLs that are already saved; the popup only warns.
    let dupNote = "";
    try {
      if ((await client.exists(page.url)).length) {
        await flash(tab.id, "DUP", "#b45309", `Already saved: ${page.url}`);
        return;
      }
    } catch (e) {
      dupNote = ` (duplicate check failed: ${e.message})`;
    }
    const collections = await client.collections();
    const result = await classify(page, collections, settings);
    await client.create({
      link: page.url,
      title: page.title,
      excerpt: page.description,
      collectionId: result.collection.id,
      tags: (result.tags || []).map((t) => t.tag),
    });
    const note = result.suggested
      ? ` (Jev picked ${result.suggested.path} at ${result.confidence.toFixed(2)}, below threshold)`
      : result.source === "jev"
        ? ` (Jev ${result.confidence.toFixed(2)})`
        : ` (${result.reason})`;
    const tagNote = result.tags?.length ? ` [${result.tags.map((t) => t.tag).join(", ")}]` : "";
    const linkNote = page.linkError ? ` (link page not read: ${page.linkError})` : "";
    await flash(tab.id, "OK", "#15803d", `Saved to ${result.collection.path}${note}${tagNote}${linkNote}${dupNote}`);
  } catch (e) {
    await flash(tab.id, "ERR", "#b91c1c", String(e.message || e));
  }
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "quick-save" || !tab?.id) return;
  autoSave(tab, await readTab(tab));
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-link",
    title: "Save link to Raindrop (auto-sort)",
    contexts: ["link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-link" || !tab?.id) return;
  autoSave(tab, await readLink(info.linkUrl, info.selectionText, await loadSettings()));
});
