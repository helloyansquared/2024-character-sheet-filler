// node test/core.test.mjs — reading + mapping tests on the made-up sample.
// Optional: REAL_DUMPS=/path/samples.json adds field dumps of real exports kept OUTSIDE this repo.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Sheet = require("../public/core.js");

execFileSync("node", [new URL("./make-sample.mjs", import.meta.url).pathname]);
const bytes = new Uint8Array(readFileSync(new URL("../public/sample/rowan-hale-ddb-format.pdf", import.meta.url)));
const rows = Sheet.read(bytes);
assert.equal(Sheet.check(rows), null, "sample should look like an export");
const c = Sheet.convert(rows);
assert.equal(c.name, "Rowan Hale");
assert.equal(c.class, "Wizard"); assert.equal(c.level, "5"); assert.equal(c.subclass, "Evoker");
assert.equal(c.species, "Human"); assert.equal(c.background, "Sage"); assert.equal(c.size, "Medium");
assert.deepEqual(c.slots, { 1: 4, 2: 3, 3: 2 });
assert.deepEqual(c.abil.find(a => a[0] === "INT"), ["INT", "18", "+4", "+7", true]);
assert.deepEqual(c.abil.find(a => a[0] === "DEX"), ["DEX", "14", "+2", "+2", false]);
assert.equal(c.skills.find(s => s[0] === "Investigation")[2], "P");
assert.equal(c.spells.length, 16);
const by = n => c.spells.find(s => s.name === n);
assert.equal(by("Identify").R, true, "ritual list covers spells DDB did not tag [R]");
assert.equal(by("Identify").note, "1/LR");
assert.equal(by("Identify").alwaysPrepared, true);
assert.equal(by("Detect Magic").R, true); assert.equal(by("Detect Magic").C, true);
assert.equal(by("Fireball").level, 3); assert.equal(by("Fireball").M, true);
assert.equal(by("Magic Missile").R, false);
assert.deepEqual(c.feats, ["Magic Initiate (Wizard)", "Skilled"]);
assert.ok(c.classFeatures.includes("Ritual Adept") && !c.classFeatures.includes("Wizard Subclass"));
assert.deepEqual(c.speciesTraits, ["Resourceful", "Skillful", "Versatile"]);
assert.ok(c.equipment.includes("Parchment (one sheet) x10"));
assert.deepEqual(c.warnings, []);
assert.equal(Sheet.abbr("60 ft./20 ft. Square"), "60ft/20ft sq");
assert.equal(Sheet.abbr("Martial, Heavy, Reach, Two-Handed, Graze"), "Heavy, Reach, 2H, Graze");
assert.equal(Sheet.abbr("Simple, Finesse, Light, Thrown, Nick, Range (20/60)"), "Finesse, Light, Thrown, Nick, 20/60");
assert.equal(Sheet.abbr("1A + 10m"), "1A+10m");
assert.equal(Sheet.abbr("Self/15 ft. Emanation"), "Self/15ft eman");

// errors
assert.equal(Sheet.check(Object.assign([], { pages: 2 })), "no-fields");
assert.throws(() => Sheet.read(new TextEncoder().encode("hello")), /not-pdf/);

// optional real dumps (never committed)
const dumps = process.env.REAL_DUMPS;
if (dumps && existsSync(dumps)) {
  const j = JSON.parse(readFileSync(dumps, "utf8"));
  const fix = r => ({ ...r, rect: r.rect || (r.y != null ? [r.x, r.y, r.x, r.y] : [0, 0, 0, 0]) });
  const n = Sheet.convert(j.real1_nenise_2024_bard5.map(fix));
  assert.equal(n.class, "Bard"); assert.equal(n.subclass, "College of Requiems"); assert.deepEqual(n.slots, { 1: 4, 2: 3, 3: 2 });
  const v = Sheet.convert(j.real2_varric_2014_artificer5_wizard2.map(fix));
  assert.equal(v.level, "7"); assert.deepEqual(v.warnings, ["multiclass"]);
  console.log("real dumps: ok");
}
console.log("core tests: ok");
