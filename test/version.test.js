import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("manifest.json and package.json carry the same SemVer version", async () => {
  const manifest = JSON.parse(await read("manifest.json"));
  const pkg = JSON.parse(await read("package.json"));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, pkg.version);
});

test("CHANGELOG.md has a section for the current version", async () => {
  const { version } = JSON.parse(await read("package.json"));
  const changelog = await read("CHANGELOG.md");
  assert.match(changelog, new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m"));
});
