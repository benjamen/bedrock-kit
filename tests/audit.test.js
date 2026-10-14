import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { auditPack } from "../scripts/audit-pack.mjs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
function make() {
  const root = mkdtempSync(join(tmpdir(), "pack-"));
  const put = (p, c) => { const f = join(root, p); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, c); };
  const v = [1, 0, 0];
  put("RP/manifest.json", JSON.stringify({ format_version: 2, header: { name: "r", uuid: "r-1", version: v }, modules: [{ type: "resources", uuid: "r-2", version: v }] }));
  put("BP/manifest.json", JSON.stringify({ format_version: 2, header: { name: "b", uuid: "b-1", version: v }, modules: [{ type: "script", entry: "scripts/main.js", uuid: "b-2", version: v }], dependencies: [{ uuid: "r-1", version: v }] }));
  put("BP/scripts/main.js", 'import "./other.js";\n');
  put("BP/scripts/other.js", "export {};\n");
  put("BP/pack_icon.png", PNG);
  put("RP/pack_icon.png", PNG);
  return { root, put };
}

test("audit: a clean pack has no problems", () => {
  const { root } = make();
  assert.deepEqual(auditPack(root), []);
  rmSync(root, { recursive: true });
});

test("audit: catches version drift, a missing icon, a broken import and a missing texture", () => {
  const { root, put } = make();
  put("BP/scripts/main.js", 'import "./missing.js";\n');
  rmSync(join(root, "RP/pack_icon.png"));
  const rp = JSON.parse(readFileSync(join(root, "RP/manifest.json"), "utf8"));
  rp.header.version = [1, 0, 1];
  put("RP/manifest.json", JSON.stringify(rp));
  put("RP/textures/terrain_texture.json", JSON.stringify({ texture_data: { a: { textures: "textures/blocks/nope" } } }));
  const text = auditPack(root).join("\n");
  for (const want of ["RP/pack_icon.png is missing", "imports ./missing.js", "depends on RP 1.0.0 but the RP is 1.0.1", "nope"]) assert.ok(text.includes(want), want);
  rmSync(root, { recursive: true });
});

test("audit: catches invalid JSON and a sound with no file", () => {
  const { root, put } = make();
  put("BP/blocks/bad.json", "{ nope");
  put("RP/sounds/sound_definitions.json", JSON.stringify({ sound_definitions: { "x.y": { sounds: [{ name: "sounds/x/y" }] } } }));
  const text = auditPack(root).join("\n");
  assert.match(text, /bad\.json: not valid JSON/);
  assert.match(text, /sound x\.y/);
  rmSync(root, { recursive: true });
});

