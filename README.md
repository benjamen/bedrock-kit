# bedrock-kit

Reusable, game-agnostic parts for Bedrock add-on games and packs. Used by DeadAir and by the effect packs
(Weather Events, Natural Disasters, Deep Night). Everything here takes the game's data as arguments and knows nothing
about any game's story, places or ids; `tests/kit.test.js` enforces it (kit files import only each other and
`@minecraft/*`, and never name a game or pack id).

## Using it in a pack

A Bedrock pack can only import code inside itself, so each pack carries a vendored copy of `kit/` and a script keeps
the copies honest:

```
node scripts/sync-kit.mjs ../my-pack/BP/scripts/kit          # copy in, write KIT_VERSION.json
node scripts/sync-kit.mjs ../my-pack/BP/scripts/kit --check  # exit 1 if the pack's copy has drifted
node scripts/gen-fogs.mjs ../my-pack/RP/fogs                 # only for packs that use the fog mixer
```

Change the kit here, never in a pack's copy: the pack's tests run `--check` and fail on drift. Bump `version` in
`package.json` when the kit changes.

## Modules

| Module | Pure? | What it does |
| --- | --- | --- |
| `intensity.js` | yes | The 0 to 3 intensity scale: `approach` (ease toward a target), `levelOf` (whole level with hysteresis), `byLevel` tables, `phaseAt` (omen, event, aftermath), `smoothstep` |
| `fog.js` | yes | Shared fog: ladder of fog definitions, `mixFog` (layers of haze add up), `snapFog` (nearest rung, with hysteresis), `electOwner` |
| `fog-mixer.js` | no | Applies the mixed fog per player; copies of the kit in different packs elect one owner so packs never fight over the fog command |
| `luminance.js` | yes | Light levels of vanilla blocks and hand-held lights, candles included, with a game's own table on top |
| `shelter.js` | mostly | Is a point open to the sky (roofs, leaves and glass are cover) |
| `scene-math.js` | yes | Look rotations, `camera`/`fade` command builders, shot helper, scene checks, actor paths |
| `scene-player.js` | no | Plays a scene (camera, fades, sounds, commands, HUD, input lock, sneak to skip, always hands back); `skipScene`, and `cancelScene` to stop one dead for a reset |
| `ground.js` | no | Where an actor can stand on a column (`standAt`), a clear line of sight (`lineClear`), a cached column sampler |
| `actors.js` | no | Scene actors: spawn with a tag, hold in place each tick, always removed |
| `water-zones.js` | yes | Shore distance and depth over a height map; named water zones; nearest spots; spots kept clear of lights |
| `sea-patrol.js` | no | Keeps water creatures around players in their zones |
| `projectiles.js` | no | Fires projectile entities at a target, with a fan spread |
| `aim.js` | yes | Aiming maths for projectiles; is a point inside a viewer's view cone |
| `abilities.js` | yes | Special attacks as data: cooldowns, ranges, a warning before firing, call-offs; table checks |
| `ability-runner.js` | no | Runs a game's ability tables for creatures near players |
| `effects.js` | no | Sound, particle, knock, pull, lunge, mob effect, shockwave, capped summon |
| `elements.js` | no | Burn, freeze (with ice shackles), chill, frost ring, fire trail |
| `cells.js` | yes | Cell shapes for world effects: ring, shackles, trail, scatter; due restores |
| `temp-blocks.js` | no | Blocks that appear for a moment: only into air, always put back, survives a restart |
| `projectile-hooks.js` | no | Per-projectile-type hooks for hitting an entity or a block |
| `tide.js` | yes | A tide on a fixed cycle |
| `forms.js` | no | Reusable forms: a combination lock of digit dials |

"Pure" modules have no Minecraft imports and are fully tested here. The others are thin glue over the Script API and
can only be checked in a running game.

## The shared fog

Weather, disasters and night all dim the player's view, and the game's `fog` command lets only the last push win, with
distances fixed in pack files. So packs never push fog. Each calls `setFog(layer, playerId, { distance, tint })` with
what it wants; the mixer combines the asks as layers of thin air (visible distance = 1 / sum of 1 / distance, so night
plus rain is a little darker than night alone), snaps to a ladder of pre-built fog definitions and pushes that. Asks
lapse after about three seconds unless refreshed, so a pack that stops (or crashes) stops dimming the world.

Every pack that uses it calls `startFogMixer({ packId })` once. Copies announce themselves with `kit:hello` script
events and the lowest pack id applies the fog, so the packs share one mixer without sharing code. This relies on
`system.sendScriptEvent`; if the game build lacks it the mixer logs a line and each pack runs alone.

## Not yet verified in a game

The mixer's cross-pack messages, the `fog` command sequence, and the three effect packs' Minecraft layers have only
been written against the API documentation, never run. See each pack's `DESIGN.md` for what to check first.
