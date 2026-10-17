import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { aimVelocity } from "../kit/aim.js";
import { lookRotation, sceneProblems, shotAt } from "../kit/scene-math.js";
import { shoreDistances, spotsNear, waterZones } from "../kit/water-zones.js";

const KIT = new URL("../kit/", import.meta.url);

test("the kit stays game-agnostic: it imports only itself and @minecraft, and names no game ids", () => {
  for (const f of readdirSync(KIT).filter((n) => n.endsWith(".js"))) {
    const src = readFileSync(new URL(f, KIT), "utf8");
    for (const m of src.matchAll(/^import[^"]*"([^"]+)"/gm)) {
      assert.ok(m[1].startsWith("./") || m[1].startsWith("@minecraft/"), `${f} imports ${m[1]} from outside the kit`);
      assert.ok(!m[1].startsWith("./") || !m[1].includes("/", 2), `${f} reaches out of the kit through ${m[1]}`);
    }
    assert.doesNotMatch(src, /["'`](?:da|wx|nd|dn):|DeadAir|Harrow/, `${f} names something from a game or a pack`);
  }
});

// A 9x9 map: land in the middle column x = 0, water everywhere else, the bed deepening away from the land.
const half = 4, size = 9;
const height = new Int16Array(size * size);
const water = (i) => (i % size) - half !== 0;
for (let i = 0; i < size * size; i++) height[i] = water(i) ? -1 - Math.abs((i % size) - half) : 3;
const map = { size, half, height, isWater: water };

test("shore distance counts steps from the nearest land column", () => {
  const d = shoreDistances(map);
  const at = (x, z) => d[(z + half) * size + (x + half)];
  assert.equal(at(0, 0), 0);
  assert.equal(at(1, 0), 1);
  assert.equal(at(-3, 2), 3);
});

test("water zones split shallow water by the shore from deep water further out", () => {
  const z = waterZones(map, { near: { depth: [1, 2], shore: [1, 2], max: 99 }, far: { depth: [3, 9], shore: [3, 9], max: 99 } });
  assert.ok(z.near.length > 0 && z.far.length > 0);
  for (const [x] of z.near) assert.ok(Math.abs(x) <= 2, `shallow spot at x ${x}`);
  for (const [x] of z.far) assert.ok(Math.abs(x) >= 3, `deep spot at x ${x}`);
  const capped = waterZones(map, { near: { depth: [1, 2], shore: [1, 2], max: 3 } });
  assert.ok(capped.near.length <= 3);
});

test("spotsNear keeps the ring and sorts nearest first", () => {
  const s = spotsNear([[0, 10], [0, 3], [0, 50], [0, 20]], { x: 0, z: 0 }, 5, 30);
  assert.deepEqual(s.map((p) => p.z), [10, 20]);
});

test("aim: the velocity has the asked speed, points at the target, and a fan turns it", () => {
  const v = aimVelocity({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 1.5);
  assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1.5) < 1e-9);
  assert.ok(v.x > 1.3 && Math.abs(v.z) < 1e-9 && v.y > 0, "a level shot should lift a little");
  const fanned = aimVelocity({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 1.5, 20);
  assert.ok(fanned.z > 0.3, "a fan turns the shot");
});

test("scene checks catch shots outside the scene and moves still easing at the end", () => {
  const o = { x: 0, y: 0, z: 0 };
  assert.deepEqual(sceneProblems({ end: 100, shots: [shotAt(0, o, { x: 1, y: 0, z: 0 }, 1)] }), []);
  assert.equal(sceneProblems({ end: 100, shots: [shotAt(90, o, { x: 1, y: 0, z: 0 }, 1)] }).length, 1);
  assert.equal(sceneProblems({ end: 100, shots: [{ at: 120, fade: {} }] }).length, 1);
  assert.deepEqual(shotAt(5, o, { x: 0, y: 0, z: 3 }).camera.rot, lookRotation(o, { x: 0, y: 0, z: 3 }));
});

import { abilityProblems, abilityStep } from "../kit/abilities.js";
import { lookedAt } from "../kit/aim.js";

const charge = { name: "charge", range: [5, 15], cooldown: 100, windup: 20, keepWhen: (c) => !c.seen };
const bite = { name: "bite", range: [0, 2], cooldown: 30, windup: 0 };

test("an ability with a windup warns first, then fires if it still can", () => {
  let r = abilityStep(undefined, { dist: 10, seen: false }, 0, [charge]);
  assert.equal(r.tell, "charge");
  assert.equal(r.fire, undefined);
  r = abilityStep(r.memory, { dist: 10, seen: false }, 10, [charge]);
  assert.equal(r.fire, undefined, "it fired before the windup ended");
  r = abilityStep(r.memory, { dist: 12, seen: false }, 20, [charge]);
  assert.equal(r.fire, "charge");
});

test("the counter works: an ability whose keepWhen fails at the end of its windup is called off", () => {
  let r = abilityStep(undefined, { dist: 10, seen: false }, 0, [charge]);
  r = abilityStep(r.memory, { dist: 10, seen: true }, 20, [charge]);
  assert.equal(r.cancel, "charge");
  assert.equal(r.fire, undefined);
  // And it still has to cool down before it can try again.
  assert.equal(abilityStep(r.memory, { dist: 10, seen: false }, 60, [charge]).tell, undefined);
});

test("abilities respect range, cooldown, priority and the gap between attacks", () => {
  assert.equal(abilityStep(undefined, { dist: 30 }, 0, [charge, bite]).tell, undefined, "out of range");
  let r = abilityStep(undefined, { dist: 1 }, 0, [charge, bite]);
  assert.equal(r.fire, "bite", "an instant ability fires at once");
  assert.equal(abilityStep(r.memory, { dist: 1 }, 10, [bite]).fire, undefined, "no gap before the next attack");
  assert.equal(abilityStep(r.memory, { dist: 1 }, 25, [bite]).fire, undefined, "still cooling down");
  assert.equal(abilityStep(r.memory, { dist: 1 }, 30, [bite]).fire, "bite");
  assert.equal(abilityStep(undefined, { dist: 1 }, 0, [{ ...bite, chance: 0.5 }], { rand: () => 0.9 }).fire, undefined, "chance ignored");
  assert.equal(abilityStep(undefined, { dist: 1 }, 0, [{ ...bite, when: () => false }]).fire, undefined, "when ignored");
});

test("the table checks catch a windup with no warning, a bad range and a duplicate", () => {
  assert.deepEqual(abilityProblems({ m: [charge] }, new Set(["m:charge"])), []);
  assert.equal(abilityProblems({ m: [charge] }).length, 1);
  assert.equal(abilityProblems({ m: [{ ...bite, range: [3, 1] }] }).length, 1);
  assert.equal(abilityProblems({ m: [bite, bite] }).length, 1);
});

test("lookedAt: ahead is seen, behind and too far are not", () => {
  const eye = { x: 0, y: 0, z: 0 }, view = { x: 0, y: 0, z: 1 };
  assert.equal(lookedAt(eye, view, { x: 0, y: 0, z: 5 }), true);
  assert.equal(lookedAt(eye, view, { x: 0, y: 0, z: -5 }), false);
  assert.equal(lookedAt(eye, view, { x: 0, y: 0, z: 500 }), false);
});

import { dueRestores, ringCells, scatterCells, shackleCells, trailCells } from "../kit/cells.js";

test("cell shapes: a ring keeps its radius, shackles surround the feet, a trail joins its ends", () => {
  const ring = ringCells({ x: 0.5, y: 3, z: 0.5 }, 2, 3);
  assert.ok(ring.length > 8 && ring.every((c) => c.y === 3 && Math.hypot(c.x, c.z) >= 2 && Math.hypot(c.x, c.z) <= 3));
  assert.deepEqual(shackleCells({ x: 4.2, y: 1, z: -2.7 }).map((c) => `${c.x},${c.z}`).sort(), ["3,-3", "4,-2", "4,-4", "5,-3"]);
  const trail = trailCells({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
  assert.deepEqual([trail[0].x, trail[trail.length - 1].x], [0, 10]);
  assert.equal(new Set(trail.map((c) => c.x)).size, trail.length, "a trail repeats a cell");
  let k = 0;
  const rand = () => ((k = (k * 7 + 3) % 11) / 11);
  assert.ok(scatterCells({ x: 0, y: 0, z: 0 }, 2, 5, rand).every((c) => Math.hypot(c.x, c.z) <= 3));
});

test("temporary blocks come due on time", () => {
  const { due, waiting } = dueRestores([{ at: 5 }, { at: 10 }, { at: 20 }], 10);
  assert.equal(due.length, 2);
  assert.equal(waiting.length, 1);
});

test("temporary blocks only ever fill air and are always put back", () => {
  const src = readFileSync(new URL("temp-blocks.js", KIT), "utf8");
  assert.match(src, /block\.typeId !== "minecraft:air"\) continue/, "it must skip anything that is not air");
  assert.match(src, /if \(block\.typeId === r\.block\) block\.setType\("minecraft:air"\)/, "it must only clear its own block");
  assert.match(src, /setDynamicProperty\(PROPERTY/, "pending restores must survive a restart");
});

import { lobVelocity } from "../kit/aim.js";

test("a lob lands where it was aimed after the given ticks", () => {
  const from = { x: 0, y: 0, z: 0 }, to = { x: 12, y: -2, z: 5 }, g = 0.05, n = 30;
  const v = lobVelocity(from, to, g, n);
  let p = { ...from }, vy = v.y;
  for (let i = 0; i < n; i++) { p = { x: p.x + v.x, y: p.y + vy, z: p.z + v.z }; vy -= g; }
  assert.ok(Math.abs(p.x - to.x) < 1e-6 && Math.abs(p.z - to.z) < 1e-6);
  assert.ok(Math.abs(p.y - to.y) < 0.8, `lands at y ${p.y.toFixed(2)}, not ${to.y}`);
  assert.ok(v.y > 0.5, "a lob should go up first, to clear a wall");
});

test("held-light: the light block is tried by both of its names, the level is held to 1 to 15, and the spot is at head height", async () => {
  const src = readFileSync(new URL("../kit/held-light.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function lightBlockForms"), src.indexOf("const same ="));
  const mod = await import(`data:text/javascript,${encodeURIComponent(body)}`);
  assert.deepEqual(mod.lightBlockForms(12).map((f) => f.id), ["minecraft:light_block", "minecraft:light_block_12"]);
  assert.equal(mod.lightBlockForms(40)[0].states.block_light_level, 15);
  assert.equal(mod.lightBlockForms(0)[0].states.block_light_level, 1);
  assert.deepEqual(mod.lightSpot({ x: 3.7, y: 64, z: -1.2 }), { x: 3, y: 65, z: -2 });
});

test("fog: an exclusive ask (a scene's clear view) is mixed alone, the rest come back when it goes", async () => {
  const { mixFog } = await import("../kit/fog.js");
  const mist = { distance: 30, tint: "mist" }, night = { distance: 20, tint: "night" };
  const together = mixFog([mist, night]);
  assert.ok(together.distance < 20, "layers add up");
  const clear = mixFog([mist, night, { distance: 90, tint: "grey", exclusive: true }]);
  assert.ok(Math.abs(clear.distance - 90) < 1e-9, "only the exclusive ask counts");
  assert.ok(mixFog([mist, night]).distance < 20, "and without it the layers add up again");
});

test("fog: mixing the usual layers (island grey, rain grey, mist, night) lands on a grey of the ramp, never on the brown ash or dust", async () => {
  const { DEFAULT_LADDER, mixFog, snapFog } = await import("../kit/fog.js");
  for (const night of [30, 60, 120]) {
    const mix = mixFog([{ distance: 58, tint: "grey" }, { distance: 90, tint: "grey" }, { distance: 28, tint: "mist" }, { distance: night, tint: "night" }]);
    const tint = snapFog(mix, DEFAULT_LADDER).tint;
    assert.ok(!["ash", "dust", "snow", "black"].includes(tint), `night ${night} snaps to ${tint}`);
  }
});
