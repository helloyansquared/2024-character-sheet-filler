// Builds public/sample/rowan-hale-ddb-format.pdf: a made-up character (SRD names only) written in the
// same shape as a D&D Beyond "Export to PDF" file — widget annotations with /T and /V on the pages,
// plain objects, and no /AcroForm in the catalog. It is test input and the site's "try a sample" file.
// No real person's character is used anywhere in this repository.
import { writeFileSync, mkdirSync } from "node:fs";

const F = (name, value, x = 40, y = 700) => ({ name, value, rect: [x, y, x + 120, y + 14] });
const p1 = [
  F("CharacterName", "Rowan Hale", 47, 710), F("CLASS  LEVEL", "Wizard 5", 271, 728), F("PLAYER NAME", "Sample", 470, 728),
  F("RACE", "Human", 271, 702), F("BACKGROUND", "Sage", 384, 702), F("EXPERIENCE POINTS", "(Milestone)", 480, 702),
  F("STR", "8"), F("STRmod", "-1"), F("DEX", "14"), F("DEXmod ", "+2"), F("CON", "14"), F("CONmod", "+2"),
  F("INT", "18"), F("INTmod", "+4"), F("WIS", "12"), F("WISmod", "+1"), F("CHA", "10"), F("CHamod", "+0"),
  F("ST Strength", "-1"), F("ST Dexterity", "+2"), F("ST Constitution", "+2"), F("IntProf", "•"), F("ST Intelligence", "+7"),
  F("WisProf", "•"), F("ST Wisdom", "+4"), F("ST Charisma", "+0"),
  F("Acrobatics", "+2"), F("Animal", "+1"), F("ArcanaProf", "P"), F("Arcana", "+7"), F("Athletics", "-1"), F("Deception", "+0"),
  F("HistoryProf", "P"), F("History", "+7"), F("InsightProf", "P"), F("Insight", "+4"), F("Intimidation", "+0"),
  F("InvestigationProf", "P"), F("Investigation", "+7"), F("Medicine", "+1"), F("Nature", "+4"), F("Perception", "+1"),
  F("Performance", "+0"), F("Persuasion", "+0"), F("Religion", "+4"), F("SleightofHand", "+2"), F("Stealth ", "+2"), F("Survival", "+1"),
  F("Passive1", "11"), F("Passive2", "14"), F("Passive3", "11"), F("Init", "+2"), F("AC", "12"), F("ProfBonus", "+3"),
  F("Speed", "30 ft. (Walking)"), F("MaxHP", "32"), F("TempHP", "--"), F("Total", "5d6"),
  F("ProficienciesLang", "=== ARMOR === \nNone \n\n=== WEAPONS === \nSimple Weapons \n\n=== TOOLS === \nCalligrapher's Supplies \n\n=== LANGUAGES === \nCommon, Draconic, Elvish"),
  F("Wpn Name", "Dagger"), F("Wpn1 AtkBonus", "+5"), F("Wpn1 Damage", "1d4+2 Piercing"), F("Wpn Notes 1", "Simple, Finesse, Light, Thrown, Nick, Range (20/60)"),
  F("Wpn Name 2", "Fire Bolt"), F("Wpn2 AtkBonus ", "+7"), F("Wpn2 Damage ", "2d10 Fire"), F("Wpn Notes 2", "V/S"),
  F("Wpn Name 3", "Unarmed Strike"), F("Wpn3 AtkBonus  ", "+1"), F("Wpn3 Damage ", "0 Bludgeoning"),
];
const p2 = [
  F("FeaturesTraits1", "=== WIZARD FEATURES === \n\n* Core Wizard Traits • SRD \n\n* Spellcasting • SRD \n\n* Ritual Adept • SRD \n\n* Arcane Recovery • SRD \n\n* Scholar • SRD \n\n* Wizard Subclass • SRD \n\n   | Evoker \n\n* Evocation Savant • SRD \n\n* Potent Cantrip • SRD \n\n* Ability Score Improvement • SRD \n\n* Memorize Spell • SRD \n\n"),
  F("FeaturesTraits2", "=== HUMAN SPECIES TRAITS === \n\n* Creature Type • SRD \n\n* Resourceful • SRD \n\n* Skillful • SRD \n\n* Versatile • SRD \n\n=== FEATS === \n\n* Magic Initiate (Wizard) • SRD \n\n* Skilled • SRD \n"),
  F("CP", "0"), F("SP", "12"), F("EP", "0"), F("GP", "86"), F("PP", "0"),
  ...["Quarterstaff", "Dagger", "Spellbook", "Component Pouch", "Robe", "Backpack", "Ink (1-ounce bottle)", "Parchment (one sheet)", "Book"]
    .flatMap((n, i) => [F("Eq Name" + i, n), F("Eq Qty" + i, n.startsWith("Parchment") ? "10" : "1")]),
];
const p3 = [F("CharacterName4", "Rowan Hale"), F("AGE", "29"), F("SIZE", "Medium"), F("HEIGHT", "5'9\""), F("ALIGNMENT", "Neutral Good"),
  F("EYES", "Grey"), F("HAIR", "Black"), F("PersonalityTraits ", "Always has a book open, even at dinner."), F("Ideals", "Knowledge should be shared.")];
// Spell page: headers and rows, laid out top to bottom like the real export.
const p4 = [F("spellCastingAbility0", "INT", 40, 740), F("spellSaveDC0", "15", 100, 740), F("spellAtkBonus0", "+7", 160, 740), F("spellCastingClass0", "Wizard", 220, 740)];
let y = 700, i = 0, h = 0;
function header(t, slots) { p4.push(F("spellHeader" + h, t, 42, y), F("spellSlotHeader" + h, slots, 149, y)); h++; y -= 14; }
function spell(name, time, range, comps, dur, notes, prep = "O", src = "Wizard") {
  for (const [k, v] of [["Prepared", prep], ["Name", name], ["Source", src], ["CastingTime", time], ["Range", range], ["Components", comps], ["Duration", dur], ["Notes", notes]])
    p4.push(F("spell" + k + i, v, 40, y));
  i++; y -= 14;
}
header("=== CANTRIPS ===", "(At Will)");
spell("Fire Bolt", "1A", "120 ft.", "V,S", "Instantaneous", "V/S");
spell("Light", "1A", "Touch", "V,M", "1 hour", "D: 1h, V/M");
spell("Mage Hand", "1A", "30 ft.", "V,S", "1 minute", "D: 1m, V/S");
spell("Prestidigitation", "1A", "10 ft.", "V,S", "Up to 1 hour", "V/S");
header("=== 1st LEVEL ===", "4 Slots OOOO");
spell("Detect Magic [R]", "1A + 10m", "Self", "V,S", "Concentration, up to 10 minutes", "D: 10m, V/S");
spell("Magic Missile", "1A", "120 ft.", "V,S", "Instantaneous", "V/S");
spell("Shield", "1R", "Self", "V,S", "1 round", "D: 1Rnd, V/S");
spell("Sleep", "1A", "60 ft./5 ft. Sphere", "V,S,M", "Concentration, up to 1 minute", "D: 1m, V/S/M");
spell("Identify", "1m", "Touch", "V,S,M", "Instantaneous", "1/LR, V/S/M", "P", "Magic Initiate (Wizard) (Always Prepared)");
spell("Find Familiar [R]", "1h + 10m", "10 ft.", "V,S,M", "Instantaneous", "V/S/M");
header("=== 2nd LEVEL ===", "3 Slots OOO");
spell("Misty Step", "1BA", "Self", "V", "Instantaneous", "V");
spell("Scorching Ray", "1A", "120 ft.", "V,S", "Instantaneous", "V/S");
spell("Hold Person", "1A", "60 ft.", "V,S,M", "Concentration, up to 1 minute", "D: 1m, V/S/M");
header("=== 3rd LEVEL ===", "2 Slots OO");
spell("Fireball", "1A", "150 ft./20 ft. Sphere", "V,S,M", "Instantaneous", "V/S/M");
spell("Counterspell", "1R", "60 ft.", "S", "Instantaneous", "S");
spell("Fly", "1A", "Touch", "V,S,M", "Concentration, up to 10 minutes", "D: 10m, V/S/M");

// ---- write a minimal PDF by hand: catalog (no AcroForm), pages, one widget object per field ----
const esc = s => String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\n/g, "\\n");
const objs = [];   // [num, body]
let next = 3;
const pageNums = [];
for (const fields of [p1, p2, p3, p4]) {
  const pageNum = next++; pageNums.push(pageNum);
  const annotNums = fields.map(() => next++);
  const content = next++;
  const text = "BT /F1 9 Tf 40 770 Td (Sample character - made up for testing) Tj ET";
  objs.push([content, `<< /Length ${text.length} >>\nstream\n${text}\nendstream`]);
  // strings outside Latin-1 (like "•") are written as UTF-16BE hex with a BOM, as PDF requires
  const str = s => /[^\x00-\xff]/.test(s) ? "<FEFF" + [...String(s)].map(ch => ch.charCodeAt(0).toString(16).padStart(4, "0")).join("").toUpperCase() + ">" : "(" + esc(s) + ")";
  fields.forEach((f, k) => objs.push([annotNums[k], `<< /Type /Annot /Subtype /Widget /FT /Tx /T ${str(f.name)} /V ${str(f.value)} /Rect [${f.rect.join(" ")}] /P ${pageNum} 0 R /F 4 >>`]));
  objs.push([pageNum, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Annots [${annotNums.map(n => n + " 0 R").join(" ")}] /Resources << /Font << /F1 ${next} 0 R >> >> >>`]);
  objs.push([next++, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]);
}
objs.push([1, "<< /Type /Catalog /Pages 2 0 R >>"]);
objs.push([2, `<< /Type /Pages /Kids [${pageNums.map(n => n + " 0 R").join(" ")}] /Count ${pageNums.length} >>`]);
objs.sort((a, b) => a[0] - b[0]);
let out = "%PDF-1.7\n%\xD3\xF4\xCC\xE1\n";
const offsets = [];
for (const [n, body] of objs) { offsets[n] = Buffer.byteLength(out, "latin1"); out += `${n} 0 obj\n${body}\nendobj\n`; }
const xref = Buffer.byteLength(out, "latin1");
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + objs.map(([n]) => String(offsets[n]).padStart(10, "0") + " 00000 n \n").join("");
out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Creator (2024 Character Sheet Filler test sample) >> >>\nstartxref\n${xref}\n%%EOF\n`;
mkdirSync(new URL("../public/sample/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/sample/rowan-hale-ddb-format.pdf", import.meta.url), Buffer.from(out, "latin1"));
console.log("wrote sample:", objs.length, "objects,", Buffer.byteLength(out, "latin1"), "bytes");
