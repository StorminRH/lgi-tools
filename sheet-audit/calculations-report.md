# Reverse-engineering DPS / EWAR / EHP — Phase 2.6

The Sheet computes per-sleeper combat stats from raw EVE SDE attributes
and exposes the result on the **Calculations** tab. The C1–C6 / Gas /
Ore tabs read from Calculations; our current ingest scrapes the
already-computed numbers out of those tabs. This report identifies the
inputs and the formulas so a future phase can recompute these natively
from our own SDE feed (no Sheet dependency).

## Data flow

```
Sleeper Data tab         →  Calculations tab     →  C1..C6 / Gas / Ore tabs  →  our DB
(raw SDE attrs per       (per-typeID combat       (per-NPC stats already       (stored as
 sleeper typeID)          totals — DPS, EHP,       baked into wave rows)        per-NPC ints)
                          alpha, EWAR counts)
```

The Sleeper Data layout is unusual: each column-pair is one sleeper
(top row alternates `typeId, name`), and each row below it is one
`(attributeId, attributeValue)` pair pulled from CCP's `dgmTypeAttributes`
table. Missile Data follows the same shape for the three sleeper missile
types (Phantasmata 30426, Praedormitan 30428, Oneiric 30430).

## DPS

### Turret DPS

Inputs (all from Sleeper Data, by SDE attribute ID):
- **51** — `speedFactor`, used as the cycle time / RoF
- **64** — `damageMultiplier`
- **114** — `emDamage`
- **116** — `thermalDamage` (the Sheet labels Therm column 4th but the SDE attribute is 116)
- **117** — `kineticDamage`
- **118** — `explosiveDamage`

Formula per damage type:
```
turret_dps[type]  = (baseDamage[type] * damageMultiplier) / RoF
turret_alpha[type] = baseDamage[type] * damageMultiplier
total_turret_dps   = sum over EM/Exp/Kin/Therm
total_turret_alpha = sum over EM/Exp/Kin/Therm
```

Spot-check: **Sleepless Patroller** (Calculations row 3) shows Turret EM DPS = 56,
Therm DPS = 56, Total Turret DPS = 112, Turret Alpha = 560. From Sleeper Data:
EM dmg = 40, Therm dmg = 40, RoF = 5, damageMultiplier = 7.
- Alpha per shot: 40 × 7 = 280 EM + 280 Therm = 560 ✓
- DPS: 280 / 5 = 56 per damage type ✓

### Missile DPS

Inputs:
- `missileTypeId` (a Sleeper Data row points at one of 30426/30428/30430)
- From Missile Data for that missile typeID: damages (114/116/117/118),
  explosion radius (654), explosion velocity (655), damage reduction
  factor (1353), base RoF
- From Sleeper Data on the sleeper: missile damage multiplier, missile RoF

The Sheet then applies the standard EVE damage-application formula:
```
appliedDmg = min(1, sigRadius/explRadius, (sigRadius/explRadius) * (explVel/maxVel) ^ DRF)
missile_dps[type] = (baseDamage[type] * damageMultiplier * appliedDmg) / RoF
```

For Sleepers vs cruisers/battleships the sig and velocity terms cap out
near 1, so in practice each sleeper's missile DPS lookup row is constant
for a "fully-applied" target. The Calculations tab assumes that worst case.

### Total DPS / Alpha

Plain sums across turret + missile and across damage types.

## EWAR

EWAR is **not** computed — it's read directly from sleeper attributes:
- **942** — points (warp scrambler strength)
- **1456** — stasis web speed-bonus factor (negative %)
- **97 / 98** — energy neutralizer amount + activation time
- **97 / 98** also reused for **remote rep amount + activation time** on
  the support-class sleepers (Preserver / Warden / Guardian families)
- Counts (Scram count, etc.) are baked into the Calculations tab's
  Scram/Web/Neut/RRep columns and represent "how many copies of the module
  this sleeper carries" — derived from per-attribute presence.

In our current DB, `npcs.scram`, `npcs.web`, `npcs.neut`, `npcs.rrep`
already store these counts, and `waves.ew_*` sums them per wave. Nothing
to change here today — the math is already in our schema, just not
labelled as derived from SDE.

## EHP

Two conventions appear in the Sheet:

### Combat tabs (single omni-resist EHP) — what our DB stores

Inputs from Sleeper Data:
- **263 / 265 / 9** — shield HP / armor HP / structure HP
- **271 / 272 / 273 / 274** — shield resists (EM / Exp / Kin / Therm)
- **267 / 268 / 269 / 270** — armor resists (EM / Exp / Kin / Therm)
- Structure has no resists

```
omniEHP(layer, hp) = hp / (1 - avg(resist_em, resist_exp, resist_kin, resist_therm))
total_ehp = omniEHP(shield) + omniEHP(armor) + structure_hp
```

Spot-check: Sleepless Patroller has shield 0, armor 20,000 @ 75% omni, structure 10,000:
- omniEHP(armor) = 20,000 / (1 − 0.75) = 80,000
- + structure 10,000 = 90,000 ✓ (matches Calculations row 3 "Effective HP" = 90,000)

### Escalation tabs (EHP Min / EHP Max breakdown)

The Drifter and Avenger tabs print two EHP numbers per layer:
- **EHP Min** = `hp / (1 - worstResist)` — your damage applied against the
  layer's *least*-resisted profile. Floor of what you'll do.
- **EHP Max** = `hp / (1 - bestResist)` — applied against the
  *most*-resisted profile. Ceiling.

These are useful for understanding "how long will this thing live if I
shoot it omni vs in the resist hole" but don't replace the single
omni value. Recommend storing only the omni number on the escalations
table for symmetry with regular NPCs; the min/max view is a render-time
computation if we ever surface it in the UI.

## Cross-reference: what's in our `eve-data` slice today

Our `src/data/eve-data/schema.ts` currently models `eveCategories`,
`eveGroups`, `eveTypes`. **There are no attribute tables.** To recompute
these formulas natively in a future phase we'd need to:

1. Add `dgm_attribute_types` (attribute metadata: id → name, unit) and
   `dgm_type_attributes` (typeId × attributeId → value), both already
   shipped by Fuzzwork as `dgmAttributeTypes.csv` and
   `dgmTypeAttributes.csv`.
2. Extend `pnpm db:ingest:sde` to pull and upsert those two tables.
3. Replace `npcs.dps / npcs.alpha / npcs.ehp / npcs.scram / npcs.web /
   npcs.neut / npcs.rrep` writes with computed values pulled from those
   attribute tables on the fly (probably exposed as a single
   `getSleeperCombatStats(typeId)` query in `src/data/eve-data/`).

Phase 2.6 deliberately **does not** do any of this — the audit captures
the recipe; the implementation is left for the future phase.

## What Phase 2.6 ships from this report

- The `sleeper_archetypes` table seeded from the Calculations tab is the
  durable per-typeID record that lets us catch silent drift between the
  Sheet's snapshot and a future native recompute.
- The raw SDE attribute snapshots (`sleeper-attributes.json`,
  `missile-attributes.json`) committed under `sheet-audit/seed-source/`
  give the next phase a known-good reference point to validate its
  recompute against.

Everything else here is documentation only.
