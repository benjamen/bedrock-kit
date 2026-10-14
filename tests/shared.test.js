import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVEL_NAMES, MAX_LEVEL, approach, byLevel, levelOf, phaseAt, smoothstep } from "../kit/intensity.js";
import { DEFAULT_LADDER, DEFAULT_TINTS, electOwner, fogDefinitions, fogId, ladderDistances, liveAsks, mixFog, snapFog } from "../kit/fog.js";
import { lightOf } from "../kit/luminance.js";
import { exposedByHeights } from "../kit/shelter.js";
import { spotsAwayFrom } from "../kit/water-zones.js";

test("intensity: a channel eases toward its target at the given rate and never overshoots", () => {
  assert.equal(approach(0, 3, 1, 0.5), 0.5);
  assert.equal(approach(0, 1, 10, 0.5), 1, "it should stop at the target");
  assert.equal(approach(2, 0, 1, { up: 1, down: 0.25 }), 1.75, "falling uses the down rate");
  assert.equal(approach(0, 9, 100, 5), MAX_LEVEL, "targets above the scale are clamped");
  assert.equal(approach(1, -4, 100, 5), 0);
});

test("intensity: the shown level has hysteresis, so a value hovering at a boundary does not flicker", () => {
  assert.equal(levelOf(1.4), 1);
  assert.equal(levelOf(1.6), 2);
  let level = 1;
  const seen = new Set();
  for (const v of [1.45, 1.55, 1.5, 1.6, 1.52, 1.48]) seen.add((level = levelOf(v, level)));
  assert.deepEqual([...seen], [1], "wobbling around 1.5 should hold level 1");
  assert.equal(levelOf(1.9, 1), 2);
  assert.equal(levelOf(0.2, 1), 0);
  assert.equal(LEVEL_NAMES.length, MAX_LEVEL + 1);
});

test("intensity: tables by level interpolate, and smoothstep eases between its ends", () => {
  assert.equal(byLevel([0, 2, 5, 9], 2), 5);
  assert.equal(byLevel([0, 2, 5, 9], 1.5), 3.5);
  assert.equal(byLevel([0, 2, 5, 9], 7), 9);
  assert.equal(smoothstep(0, 10, -1), 0);
  assert.equal(smoothstep(0, 10, 5), 0.5);
  assert.equal(smoothstep(0, 10, 11), 1);
});

test("intensity: an event runs omen, event, aftermath, then is over", () => {
  const t = { omen: 10, event: 20, aftermath: 30 };
  assert.equal(phaseAt(-1, t).phase, "pending");
  assert.deepEqual(phaseAt(5, t), { phase: "omen", progress: 0.5, over: false });
  assert.equal(phaseAt(10, t).phase, "event");
  assert.equal(phaseAt(45, t).phase, "aftermath");
  assert.equal(phaseAt(45, t).progress, 0.5);
  assert.deepEqual(phaseAt(60, t), { phase: "done", progress: 1, over: true });
  assert.equal(phaseAt(0, { event: 5 }).phase, "event", "no omen means straight to the event");
});

test("luminance: torches, lanterns and candles give light the way the game does", () => {
  assert.equal(lightOf("minecraft:torch"), 14);
  assert.equal(lightOf("minecraft:soul_lantern"), 10);
  assert.equal(lightOf("minecraft:stone"), 0);
  assert.equal(lightOf("minecraft:candle", { candles: 3, lit: true }), 12, "four candles");
  assert.equal(lightOf("minecraft:red_candle", { candles: 0, lit: true }), 3);
  assert.equal(lightOf("minecraft:candle", { candles: 3, lit: false }), 0, "an unlit candle gives none");
  assert.equal(lightOf("minecraft:torch", {}, { "minecraft:torch": 8 }), 8, "a game's own table wins");
});

test("shelter: open to the sky only when the highest block is below the feet", () => {
  assert.equal(exposedByHeights(63, 64), true, "standing on the ground");
  assert.equal(exposedByHeights(70, 64), false, "under a roof");
  assert.equal(exposedByHeights(undefined, 64), true, "nothing above at all");
});

test("water zones: spotsAwayFrom keeps spots clear of lights, and returns the list itself when there are none", () => {
  const spots = [[0, 0], [10, 0], [30, 0]];
  assert.equal(spotsAwayFrom(spots, [], 16), spots);
  assert.deepEqual(spotsAwayFrom(spots, [{ x: 0, z: 0 }], 16), [[30, 0]]);
});

test("fog ladder: distances grow by a steady ratio from min to max", () => {
  const d = ladderDistances(DEFAULT_LADDER);
  assert.equal(d.length, DEFAULT_LADDER.steps);
  assert.equal(d[0], DEFAULT_LADDER.min);
  assert.equal(d.at(-1), DEFAULT_LADDER.max);
  for (let i = 1; i < d.length; i++) assert.ok(d[i] > d[i - 1]);
  const r = d.map((v, i) => (i ? v / d[i - 1] : 0)).slice(1);
  assert.ok(Math.max(...r) - Math.min(...r) < 0.08, "the rungs should be evenly spaced in ratio");
});

test("fog definitions: one per tint and rung, valid, unique, and the ids match what snapFog returns", () => {
  const defs = fogDefinitions();
  assert.equal(defs.length, Object.keys(DEFAULT_TINTS).length * DEFAULT_LADDER.steps);
  assert.equal(new Set(defs.map((d) => d.id)).size, defs.length);
  assert.equal(new Set(defs.map((d) => d.file)).size, defs.length);
  for (const d of defs) {
    const fog = d.json["minecraft:fog_settings"];
    assert.equal(fog.description.identifier, d.id);
    assert.ok(fog.distance.air.fog_start < fog.distance.air.fog_end, `${d.id} starts after it ends`);
    assert.match(fog.distance.air.fog_color, /^#[0-9a-f]{6}$/);
  }
  const rung = snapFog(mixFog([{ distance: 6, tint: "night" }]));
  assert.ok(defs.some((d) => d.id === rung.id), `${rung.id} has no definition`);
  assert.equal(fogId("night", 2), "kit:fog_night_2");
});

test("fog mix: layers of haze add up, the denser layer sets the colour, and no asks means no fog", () => {
  assert.equal(mixFog([]), null);
  assert.equal(mixFog([{ distance: 0, tint: "mist" }]), null, "a zero distance is not an ask");
  const one = mixFog([{ distance: 20, tint: "mist" }]);
  assert.ok(Math.abs(one.distance - 20) < 1e-9);
  const both = mixFog([{ distance: 6, tint: "night" }, { distance: 40, tint: "mist" }]);
  assert.ok(both.distance < 6 && both.distance > 5, `night plus rain should be a little under 6 blocks, got ${both.distance}`);
  const night = mixFog([{ distance: 6, tint: "night" }]).color;
  const darkest = Math.max(...both.color);
  assert.ok(darkest < Math.max(...mixFog([{ distance: 40, tint: "mist" }]).color), "the dense night should dominate the colour");
  assert.ok(Math.abs(both.color[0] - night[0]) < 40);
});

test("fog snap: picks the nearest rung and tint, and holds the previous rung while the mix wobbles", () => {
  const first = snapFog(mixFog([{ distance: 6, tint: "night" }]));
  assert.equal(first.tint, "night");
  const d = ladderDistances(DEFAULT_LADDER);
  assert.ok(Math.abs(d[first.step] - 6) <= Math.abs(d[first.step + 1] - 6) && Math.abs(d[first.step] - 6) <= Math.abs(d[Math.max(0, first.step - 1)] - 6));
  const nudged = snapFog({ distance: d[first.step] * 1.2, color: mixFog([{ distance: 6, tint: "night" }]).color }, DEFAULT_LADDER, first);
  assert.equal(nudged.step, first.step, "a small drift should not change the rung");
  const moved = snapFog({ distance: d[first.step] * 3, color: mixFog([{ distance: 6, tint: "night" }]).color }, DEFAULT_LADDER, first);
  assert.ok(moved.step > first.step, "a real change should");
  assert.equal(snapFog(null), null);
  assert.equal(snapFog(mixFog([{ distance: 500, tint: "mist" }])).step, DEFAULT_LADDER.steps - 1, "far fog clamps to the last rung");
});

test("fog owner: the lowest pack id applies the fog, the same answer in every copy; asks lapse", () => {
  assert.equal(electOwner(["pack-c", "pack-a", "pack-b", "pack-a"]), "pack-a");
  assert.equal(electOwner([]), undefined);
  const reqs = [{ until: 100 }, { until: 50 }];
  assert.equal(liveAsks(reqs, 60).length, 1);
  assert.equal(liveAsks(reqs, 100).length, 0);
});

test("fireAt can tag what it fires, so hit hooks can tell it from a base-game projectile of the same type", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../kit/projectiles.js", import.meta.url), "utf8");
  assert.match(src, /tag\b.*\} = \{\}/s);
  assert.match(src, /if \(tag\) e\.addTag\(tag\)/);
});
