#!/usr/bin/env node
// Writes the kit's fog ladder into a resource pack: node scripts/gen-fogs.mjs <pack>/RP/fogs
// Every pack that uses the fog mixer carries the same files (same ids, same content), so it does not matter which
// pack's copy the game loads.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fogDefinitions } from "../kit/fog.js";

const out = process.argv[2];
if (!out) {
  console.error("usage: gen-fogs.mjs <RP/fogs dir>");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const defs = fogDefinitions();
for (const d of defs) writeFileSync(join(out, d.file), JSON.stringify(d.json, null, 2) + "\n");
console.log(`wrote ${defs.length} fog definitions to ${out}`);
