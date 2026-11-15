import { readFile } from "node:fs/promises";
import { classify } from "../lib/classify.js";
import { DEFAULTS } from "../lib/settings.js";

const file = process.argv[2];
if (!file || !process.env.JEV_API_KEY) {
  console.error("Usage: JEV_API_KEY=... node scripts/evaluate.mjs <cases.json>");
  process.exit(1);
}

const input = JSON.parse(await readFile(file, "utf8"));
const settings = { ...DEFAULTS, ...input.settings, jevApiKey: process.env.JEV_API_KEY };
let correct = 0;
let failed = 0;
for (const item of input.cases) {
  try {
    const result = await classify({ description: "", siteName: "", selection: "", text: "", ...item.page }, input.collections, settings);
    const actual = result.collection.path;
    const match = actual === item.expected;
    if (match) correct++;
    console.log(JSON.stringify({ url: item.page.url, expected: item.expected, actual, suggested: result.suggested?.path, confidence: result.confidence, match }));
  } catch (error) {
    failed++;
    console.log(JSON.stringify({ url: item.page.url, expected: item.expected, error: error.message }));
  }
}
console.log(JSON.stringify({ total: input.cases.length, correct, failed, accuracy: input.cases.length ? correct / input.cases.length : null }));
if (failed) process.exitCode = 1;
