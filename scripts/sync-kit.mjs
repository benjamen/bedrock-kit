#!/usr/bin/env node
// Vendors the kit into a pack. A Bedrock pack can only import code that is inside itself, so each pack carries its
// own copy of kit/ and this script keeps the copies honest.
//   node scripts/sync-kit.mjs <pack>/BP/scripts/kit          copy the kit in and write KIT_VERSION.json
//   node scripts/sync-kit.mjs <pack>/BP/scripts/kit --check  exit 1 if the pack's copy differs from the kit
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "kit");
const [dest, flag] = process.argv.slice(2);
if (!dest) {
  console.error("usage: sync-kit.mjs <dest kit dir> [--check]");
  process.exit(2);
}
const sha = (path) => createHash("sha1").update(readFileSync(path)).digest("hex").slice(0, 12);
const files = readdirSync(SRC).filter((f) => f.endsWith(".js") || f === "README.md").sort();
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const manifest = { kit: "bedrock-kit", version, files: Object.fromEntries(files.map((f) => [f, sha(join(SRC, f))])) };

if (flag === "--check") {
  const problems = [];
  if (!existsSync(join(dest, "KIT_VERSION.json"))) problems.push("KIT_VERSION.json is missing");
  for (const f of files) {
    if (!existsSync(join(dest, f))) problems.push(`${f} is missing`);
    else if (sha(join(dest, f)) !== manifest.files[f]) problems.push(`${f} differs from the kit`);
  }
  for (const f of existsSync(dest) ? readdirSync(dest) : []) if (f !== "KIT_VERSION.json" && !files.includes(f)) problems.push(`${f} is not part of the kit`);
  if (problems.length) {
    console.error(`kit in ${dest} is out of sync with bedrock-kit ${version}:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`kit in ${dest} matches bedrock-kit ${version}`);
} else {
  if (existsSync(dest)) rmSync(dest, { recursive: true });
  mkdirSync(dest, { recursive: true });
  for (const f of files) copyFileSync(join(SRC, f), join(dest, f));
  writeFileSync(join(dest, "KIT_VERSION.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`copied ${files.length} kit files (bedrock-kit ${version}) to ${dest}`);
}
