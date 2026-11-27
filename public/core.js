/* 2024 Character Sheet Filler — core (runs entirely in the browser; also loads in Node for tests).
 *
 * read(bytes)            -> rows: every form widget on every page of a character-sheet PDF
 *                           exported by D&D Beyond ("Export to PDF"). Those files are written by
 *                           PDFsharp with no AcroForm entry, so ordinary form readers see nothing;
 *                           the values live in each page's widget annotations, which PDFsharp
 *                           writes as plain (uncompressed) objects. No library needed.
 * check(rows)            -> null if it looks like a character-sheet export, else an error code.
 * convert(rows)          -> a plain character object (name, class, abilities, skills, spells, ...).
 * fill(PDFLib, blank, c, opts) -> filled, still-fillable official 2024 sheet + any continuation pages.
 *
 * Tested on 5 real exports (Druid 8, Fighter 6, Bard 6, Paladin 5, Cleric 1; 2014 and 2024 rules,
 * one from the 2023 generator) and 2 field dumps. Not yet tested: level 10+, Warlock pact slots,
 * multiclass casters from a real PDF.
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- reading
  function bytesToStr(b) {
    if (b[0] === 0xfe && b[1] === 0xff) { let s = ""; for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; }
    try { return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(b)); } catch (e) { let s = ""; for (const c of b) s += String.fromCharCode(c); return s; }
  }
  function decodeLiteral(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c !== "\\") { out.push(c.charCodeAt(0) & 255); continue; }
      const n = s[++i];
      if (n === "n") out.push(10); else if (n === "r") out.push(13); else if (n === "t") out.push(9);
      else if (n === "b") out.push(8); else if (n === "f") out.push(12);
      else if (n === "\n") { /* line continuation */ } else if (n === "\r") { if (s[i + 1] === "\n") i++; }
      else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; out.push(parseInt(o, 8) & 255); }
      else if (n !== undefined) out.push(n.charCodeAt(0) & 255);
    }
    return bytesToStr(out);
  }
  function readString(t, i) {
    if (t[i] === "(") {
      let depth = 1, j = i + 1, s = "";
      while (j < t.length && depth) {
        const c = t[j];
        if (c === "\\") { s += c + t[j + 1]; j += 2; continue; }
        if (c === "(") depth++;
        if (c === ")") { depth--; if (!depth) break; }
        s += c; j++;
      }
      return decodeLiteral(s);
    }
    const e = t.indexOf(">", i), hex = t.slice(i + 1, e).replace(/\s/g, ""), b = [];
    for (let k = 0; k < hex.length; k += 2) b.push(parseInt(hex.substr(k, 2).padEnd(2, "0"), 16));
    return bytesToStr(b);
  }
  function getKey(d, key) {
    const m = new RegExp("/" + key + "\\s*([(<\\[/])").exec(d);
    if (!m) return null;
    const i = m.index + m[0].length - 1;
    if (d[i] === "(" || (d[i] === "<" && d[i + 1] !== "<")) return readString(d, i);
    if (d[i] === "/") return /\/([^\s\/\[\]<>()]+)/.exec(d.slice(i))[1];
    if (d[i] === "[") return d.slice(i + 1, d.indexOf("]", i));
    return null;
  }
  function latin1(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return s;
  }
  function read(bytes) {
    const t = latin1(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    if (!/^%PDF-/.test(t.slice(0, 1024).trimStart())) throw new Error("not-pdf");
    if (/\/Encrypt\s/.test(t)) throw new Error("encrypted");
    const objs = new Map();
    const re = /(\d+)\s+0\s+obj\s*([\s\S]*?)endobj/g; let m;
    while ((m = re.exec(t))) objs.set(+m[1], m[2]);
    const ref = s => (String(s || "").match(/(\d+)\s+0\s+R/g) || []).map(x => +x.split(/\s/)[0]);
    const root = [...objs.values()].find(d => /\/Type\s*\/Catalog/.test(d));
    const pages = [];
    if (root && /\/Pages\s+\d+\s+0\s+R/.test(root)) {
      const seen = new Set();
      (function walk(n) {
        if (seen.has(n)) return; seen.add(n);
        const d = objs.get(n); if (!d) return;
        if (/\/Type\s*\/Pages\b/.test(d)) ref(getKey(d, "Kids")).forEach(walk); else pages.push(n);
      })(ref(/\/Pages\s+\d+\s+0\s+R/.exec(root)[0])[0]);
    }
    const rows = [];
    pages.forEach((pn, pi) => {
      const d = objs.get(pn) || "";
      let annots = getKey(d, "Annots");
      if (annots === null) { const r = /\/Annots\s+(\d+)\s+0\s+R/.exec(d); annots = r ? objs.get(+r[1]) : ""; }
      for (const an of ref(annots)) {
        const a = objs.get(an);
        if (!a || !/\/Subtype\s*\/Widget/.test(a)) continue;
        const name = getKey(a, "T"); if (name === null) continue;
        let v = getKey(a, "V");
        if (v === null) v = getKey(a, "AS") === "Yes" ? "X" : "";
        if (v === "Off") v = "";
        const rect = String(getKey(a, "Rect") || "0 0 0 0").trim().split(/\s+/).map(Number);
        rows.push({ page: pi + 1, name, value: v, rect });
      }
    });
    rows.pages = pages.length;
    return rows;
  }

  function check(rows) {
    if (!rows.length) return rows.pages ? "no-fields" : "unreadable";   // printed/flattened, or a PDF we cannot parse
    const names = new Set(rows.map(r => norm(r.name)));
    if (!names.has("CharacterName") || !(names.has("CLASS LEVEL") || names.has("CLASS LEVEL2"))) return "not-ddb";
    if (!rows.some(r => norm(r.name) === "CharacterName" && r.value)) return "empty";
    return null;
  }

  // ---------------------------------------------------------------- mapping
  const norm = n => String(n).replace(/\s+/g, " ").trim();
  function F(rows) {
    const first = new Map();
    for (const r of rows) {
      const k = norm(r.name), v = String(r.value == null ? "" : r.value);
      if (!first.has(k) || (!first.get(k) && v)) first.set(k, v);
    }
    const get = (...ns) => { for (const n of ns) { const v = first.get(norm(n)) || ""; if (v && v.trim() !== "--") return v.trim(); } return ""; };
    const text = p => { let s = "", i = 1; while (first.has(p + i)) s += first.get(p + i++); return s; };
    return { get, text };
  }
  const sections = txt => {
    const res = {}; let cur = null;
    for (const line of String(txt).replace(/(===[^=\n]+===)/g, "\n$1\n").split("\n")) {
      const m = /^\s*===\s*(.+?)\s*===\s*$/.exec(line);
      if (m) { cur = m[1]; res[cur] = ""; } else if (cur) res[cur] += line + "\n";
    }
    return res;
  };
  const featureNames = b => b.split("\n").map(l => /^\s*\*\s*(.+?)\s*(?:•.*)?$/.exec(l)).filter(Boolean).map(m => m[1]);
  const SUBRE = /^\s*\*\s*(\w[\w ]*Subclass|Primal Path|Sacred Oath|Otherworldly Patron|Arcane Tradition|Divine Domain|Bard College|Martial Archetype|Monastic Tradition|Ranger Archetype|Roguish Archetype|Sorcerous Origin|Artificer Specialist|Druid Circle|Druidic Circle)\b/;
  function subclasses(b) {
    const L = b.split("\n"), res = [];
    L.forEach((l, i) => {
      if (!SUBRE.test(l)) return;
      const same = /\|\s*([^|•]+?)\s*(?:•.*)?$/.exec(l);
      if (same) { res.push(same[1]); return; }
      for (const n of L.slice(i + 1, i + 5)) { const m = /^\s*\|\s*(.+?)\s*(?:•.*)?$/.exec(n); if (m) { res.push(m[1]); break; } }
    });
    return res;
  }
  const NOISE = /^(Core \w+ Traits|\w[\w ]* Subclass|Creature Type|Size|Speed|Languages|Ability Score Improvement|Hit Points|Proficiencies|Equipment)$/;
  const LEVELS = { CANTRIPS: 0, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8, "9th": 9 };

  // Ritual spells by name (spell names are facts; no rules text). D&D Beyond only adds "[R]" when
  // the character can cast the spell as a ritual from that source, but the 2024 sheet's R box is
  // the spell's own tag, so we tick it for any ritual spell.
  const RITUALS = new Set(["alarm", "animal messenger", "augury", "beast sense", "ceremony", "commune", "commune with city",
    "commune with nature", "comprehend languages", "contact other plane", "detect magic", "detect poison and disease",
    "divination", "drawmij's instant summons", "instant summons", "feign death", "find familiar", "forbiddance",
    "gentle repose", "identify", "illusory script", "leomund's tiny hut", "tiny hut", "locate animals or plants",
    "magic mouth", "meld into stone", "phantom steed", "purify food and drink", "rary's telepathic bond",
    "telepathic bond", "silence", "skywrite", "speak with animals", "tenser's floating disk", "floating disk",
    "unseen servant", "water breathing", "water walk"]);

  function spellNote(notes) {
    // keep only the useful bits of DDB's spell notes: uses and charges ("1/LR", "1 Charge (8/8)")
    return String(notes || "").split(",").map(s => s.trim())
      .filter(s => /^\d+\s*\/\s*(LR|SR|Long Rest|Short Rest)$/i.test(s) || /^\d+\s+Charges?\b/i.test(s) || /^At will$/i.test(s))
      .join(", ");
  }

  function spells(rows) {
    const top = r => Math.max(r.rect[1] || 0, r.rect[3] || 0);
    const sp = rows.filter(r => /^spell(Header|SlotHeader|Name|Prepared|Source|SaveHit|CastingTime|Range|Components|Duration|Page|Notes)\d+$/.test(norm(r.name)));
    const pages = [...new Set(sp.map(r => r.page))].sort((a, b) => a - b);
    let carry = null; const slots = {}, out = [], seen = new Set();
    let pact = false;
    for (const p of pages) {
      const P = sp.filter(r => r.page === p);
      const heads = P.filter(r => /^spellHeader\d+$/.test(norm(r.name))).map(h => {
        const m = /===\s*(CANTRIPS|\w+)/.exec(h.value || "");
        return { idx: /\d+$/.exec(norm(h.name))[0], top: top(h), level: m && m[1] in LEVELS ? LEVELS[m[1]] : null };
      }).sort((a, b) => b.top - a.top);
      for (const s of P.filter(r => /^spellSlotHeader\d+$/.test(norm(r.name)))) {
        const h = heads.find(x => x.idx === /\d+$/.exec(norm(s.name))[0]);
        const m = /^\s*(\d+)\s+Slots?/i.exec(s.value || "");
        if (/pact/i.test(s.value || "")) pact = true;
        if (h && h.level && m) slots[h.level] = (slots[h.level] || 0) + +m[1];
      }
      const byIdx = new Map();
      for (const r of P) {
        const [, kind, idx] = /^spell(\w+?)(\d+)$/.exec(norm(r.name));
        if (kind === "Header" || kind === "SlotHeader") continue;
        if (!byIdx.has(idx)) byIdx.set(idx, { top: top(r) });
        const o = byIdx.get(idx); o[kind] = r.value; o.top = Math.max(o.top, top(r));
      }
      const rowsP = [...byIdx.values()].sort((a, b) => b.top - a.top);
      for (const o of rowsP) { const above = heads.filter(x => x.top >= o.top - 1); o.level = above.length ? above[above.length - 1].level : carry; }
      if (heads.length) carry = heads[heads.length - 1].level;
      for (const s of rowsP) {
        if (!s.Name) continue;
        const raw = String(s.Name);
        const name = raw.replace(/\s*(\[R\]|<C>)\s*/g, " ").trim();
        const key = s.level + "|" + name.toLowerCase() + "|" + (s.Source || "");
        if (seen.has(key)) continue; seen.add(key);
        out.push({
          level: s.level == null ? 0 : s.level, name,
          time: s.CastingTime || "", range: s.Range || "",
          C: /Concentration/i.test(s.Duration || "") || /<C>/.test(raw),
          R: /\[R\]/.test(raw) || RITUALS.has(name.toLowerCase()),
          M: String(s.Components || "").split(",").map(x => x.trim()).includes("M"),
          alwaysPrepared: s.Prepared === "P",
          source: s.Source || "", note: spellNote(s.Notes),
        });
      }
    }
    return { spells: out, slots, pact };
  }

  const ABIL = [["STR", "STRmod", "ST Strength", "StrProf"], ["DEX", "DEXmod", "ST Dexterity", "DexProf"], ["CON", "CONmod", "ST Constitution", "ConProf"],
    ["INT", "INTmod", "ST Intelligence", "IntProf"], ["WIS", "WISmod", "ST Wisdom", "WisProf"], ["CHA", "CHamod", "ST Charisma", "ChaProf"]];
  const SKILLS = [["Acrobatics", "Acrobatics"], ["Animal Handling", "Animal", "AnimalHandlingProf"], ["Arcana", "Arcana"], ["Athletics", "Athletics"],
    ["Deception", "Deception"], ["History", "History"], ["Insight", "Insight"], ["Intimidation", "Intimidation"], ["Investigation", "Investigation"],
    ["Medicine", "Medicine"], ["Nature", "Nature"], ["Perception", "Perception"], ["Performance", "Performance"], ["Persuasion", "Persuasion"],
    ["Religion", "Religion"], ["Sleight of Hand", "SleightofHand", "SleightOfHandProf"], ["Stealth", "Stealth"], ["Survival", "Survival"]];

  function convert(rows) {
    const f = F(rows), c = { warnings: [] };
    const cls = f.get("CLASS LEVEL", "CLASS LEVEL2");
    const classes = cls.split("/").map(p => /^\s*(.+?)\s+(\d+)\s*$/.exec(p)).filter(Boolean).map(m => [m[1].trim(), +m[2]]);
    const secs = sections(f.text("FeaturesTraits"));
    c.name = f.get("CharacterName", "CharacterName2");
    c.background = f.get("BACKGROUND"); c.species = f.get("RACE", "Race");
    c.classes = classes;
    c.class = classes.length === 1 ? classes[0][0] : cls;
    c.level = classes.length ? String(classes.reduce((a, x) => a + x[1], 0)) : "";
    c.subclass = Object.entries(secs).filter(([h]) => /FEATURES$/.test(h)).flatMap(([, b]) => subclasses(b)).join(" / ");
    const xp = f.get("EXPERIENCE POINTS"); c.xp = /milestone/i.test(xp) ? "" : xp;
    c.ac = f.get("AC"); c.hpMax = f.get("MaxHP"); c.hpCurrent = f.get("CurrentHP"); c.hpTemp = f.get("TempHP");
    c.hitDice = f.get("Total"); c.pb = f.get("ProfBonus"); c.init = f.get("Init");
    c.speed = f.get("Speed").replace(/\s*\(Walking\)/i, ""); c.size = f.get("SIZE"); c.passive = f.get("Passive1");
    c.inspiration = !!f.get("Inspiration");
    c.abil = ABIL.map(([a, m, s, p]) => [a, f.get(a), f.get(m, a[0] + a.slice(1).toLowerCase() + "mod"), f.get(s), !!f.get(p)])
      .map(([a, sc, md, sv, p]) => (/^[+-]/.test(sc) && /^\d+$/.test(md)) ? [a, md, sc, sv, p] : [a, sc, md, sv, p]); // 2023 template swaps score/mod
    c.skills = SKILLS.map(([l, fld, pf]) => [l, f.get(fld), f.get(pf || fld + "Prof")]);
    c.weapons = [];
    for (let i = 1; i <= 12; i++) {
      const n = f.get(i === 1 ? "Wpn Name" : "Wpn Name " + i);
      if (n) c.weapons.push([n, f.get("Wpn" + i + " AtkBonus"), f.get("Wpn" + i + " Damage"), f.get("Wpn Notes " + i)]);
    }
    c.classFeatures = []; c.speciesTraits = []; c.feats = [];
    for (const [h, b] of Object.entries(secs)) {
      const ns = featureNames(b).map(n => n.replace(/^\d+:\s*/, "").replace(/\|.*$/, "").trim()).filter(n => n && !NOISE.test(n));
      if (/FEATURES$/.test(h)) c.classFeatures.push(...ns);
      else if (/TRAITS/.test(h)) c.speciesTraits.push(...ns);
      else if (h === "FEATS") c.feats.push(...ns);
    }
    c.classFeatures = [...new Set(c.classFeatures)]; c.feats = [...new Set(c.feats)];
    const prof = sections(f.get("ProficienciesLang"));
    c.armor = ["Light", "Medium", "Heavy", "Shield"].filter(x => new RegExp(x, "i").test(prof.ARMOR || ""));
    c.weaponProf = (prof.WEAPONS || "").replace(/\s+/g, " ").trim();
    c.tools = (prof.TOOLS || "").replace(/\s+/g, " ").trim();
    c.languages = (prof.LANGUAGES || "").replace(/\s+/g, " ").trim();
    c.equipment = [];
    for (let i = 0; i < 150; i++) {
      const n = f.get("Eq Name" + i);
      if (n) { const q = f.get("Eq Qty" + i); c.equipment.push(q && q !== "1" ? n + " x" + q : n); }
    }
    c.attuned = [1, 2, 3].map(i => f.get("Attuned Name" + i)).filter(Boolean);
    c.coins = { CP: f.get("CP"), SP: f.get("SP"), EP: f.get("EP"), GP: f.get("GP"), PP: f.get("PP") };
    c.alignment = f.get("ALIGNMENT");
    c.appearance = ["AGE", "HEIGHT", "WEIGHT", "EYES", "SKIN", "HAIR"].filter(k => f.get(k)).map(k => k[0] + k.slice(1).toLowerCase() + ": " + f.get(k))
      .concat(f.get("Appearance") ? [f.get("Appearance")] : []).join("; ");
    c.backstory = ["PersonalityTraits", "Ideals", "Bonds", "Flaws", "Backstory"].map(k => f.get(k)).filter(Boolean).join("\n\n");
    c.spellAbility = f.get("spellCastingAbility0"); c.spellDC = f.get("spellSaveDC0"); c.spellAtk = f.get("spellAtkBonus0");
    const sp = spells(rows);
    c.spells = sp.spells; c.slots = sp.slots;
    if (classes.length > 1) c.warnings.push("multiclass");
    if (sp.pact || classes.some(([n]) => /warlock/i.test(n))) c.warnings.push("pact");
    if (classes.some(([, l]) => l >= 10)) c.warnings.push("high-level");
    return c;
  }

  // ---------------------------------------------------------------- writing
  // Field ids of the official 2024 sheet (D&D Free Rules, form-fillable version), found by filling every
  // field with its own name and rendering it. Spell rows, their notes and the C/R/M boxes have irregular
  // names, so those are matched by position.
  const REQUIRED = ["Text1", "Text7", "Text9", "Text11", "Text13", "Text16", "Text19", "Text54", "Text99", "Text111", "Text106.0", "Text106.29"];

  function checkBlank(PDFLib, form) {
    const have = new Set(form.getFields().map(f => f.getName()));
    const missing = REQUIRED.filter(n => !have.has(n));
    return missing.length ? missing : null;
  }

  const ABBR = [[/(\d)\s*(?:feet|ft\.?)(?=\s|\/|$)/gi, "$1ft"], [/\bSphere\b/g, "sph"], [/\bSquare\b/g, "sq"], [/\bCylinder\b/g, "cyl"],
    [/\bEmanation\b/g, "eman"], [/\bTwo-Handed\b/g, "2H"], [/\bVersatile\b/g, "Vers"], [/\bAmmunition\b/g, "Ammo"], [/\bLoading\b/g, "Load"],
    [/\bRange\b/g, "Rng"], [/\s*\/\s*/g, "/"], [/\s{2,}/g, " "]];
  const abbr = s => ABBR.reduce((a, [re, to]) => a.replace(re, to), String(s || "")).trim();

  async function fill(PDFLib, blankBytes, c, opts) {
    opts = opts || {};
    const doc = await PDFLib.PDFDocument.load(blankBytes);
    const form = doc.getForm();
    const missing = checkBlank(PDFLib, form);
    if (missing) { const e = new Error("bad-blank"); e.missing = missing; throw e; }
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const overflow = [], replaced = new Set();
    const MIN = 6;
    const pages = doc.getPages();
    const annotPage = new Map();
    pages.forEach((p, i) => { const a = p.node.Annots(); if (a) a.asArray().forEach(r => annotPage.set(r.toString(), i + 1)); });
    const W = [];
    for (const fld of form.getFields()) for (const w of fld.acroField.getWidgets()) {
      const r = w.getRectangle(), ref = doc.context.getObjectRef(w.dict);
      W.push({ f: fld, page: annotPage.get(ref ? ref.toString() : "") || 0, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    const safe = s => [...String(s == null ? "" : s)].map(ch => {
      if (ch === "\n") return ch;
      try { font.encodeText(ch); return ch; } catch (e) {
        const plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
        try { if (plain && plain !== ch) { font.encodeText(plain); return plain; } } catch (e2) { /* fall through */ }
        if (ch === "•") return "-";
        replaced.add(ch); return "?";
      }
    }).join("");
    const wrap = (text, size, width) => {
      const lines = [];
      for (const para of String(text).split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/)) {
          const t = line ? line + " " + word : word;
          if (font.widthOfTextAtSize(t, size) <= width) line = t; else { if (line) lines.push(line); line = word; }
        }
        lines.push(line);
      }
      return lines;
    };
    function put(field, text, label, fallback) {
      text = safe(text).trim(); if (!text) return;
      const r = field.acroField.getWidgets()[0].getRectangle();
      if (!field.isMultiline()) {
        let size = Math.min(10, r.height * 0.7);
        const fits = s => font.widthOfTextAtSize(text, s) <= r.width - 4;
        while (size > MIN && !fits(size)) size -= 0.5;
        if (!fits(size) && fallback) { const short = safe(fallback).trim(); if (font.widthOfTextAtSize(short, MIN) < font.widthOfTextAtSize(text, MIN)) { overflow.push({ label: label || "Notes", text }); text = short; size = Math.min(10, r.height * 0.7); while (size > MIN && font.widthOfTextAtSize(text, size) > r.width - 4) size -= 0.5; } }
        if (font.widthOfTextAtSize(text, size) > r.width - 4) {
          // still too long at the minimum size: keep what fits and move the full text to the extra page
          overflow.push({ label: label || "Notes", text });
          let cut = text; while (cut.length > 1 && font.widthOfTextAtSize(cut + "…", size) > r.width - 4) cut = cut.slice(0, -1);
          text = cut.trimEnd() + "…";
        }
        field.setText(text); field.setFontSize(size); return;
      }
      let size = 9, lines;
      for (;;) { lines = wrap(text, size, r.width - 6); if (lines.length * size * 1.15 <= r.height - 4 || size <= MIN) break; size -= 0.5; }
      const fit = Math.max(1, Math.floor((r.height - 4) / (size * 1.15)));
      if (lines.length > fit) { overflow.push({ label: label || "Notes", text }); lines = lines.slice(0, fit - 1).concat(["(continued on the extra page)"]); }
      field.enableMultiline(); field.setText(lines.join("\n")); field.setFontSize(size);
    }
    const T = (id, v, label, fb) => put(form.getTextField("Text" + id), v, label, fb);
    const check = (name, on) => { if (on) form.getCheckBox(name).check(); };

    // page 1
    T(1, c.name); T(6, c.background); T(7, c.class, "Class"); T(8, c.species); T(9, c.subclass, "Subclass"); T(11, c.level); T(12, c.xp);
    T(13, c.ac); T(14, c.hpCurrent); T(15, c.hpTemp); T(16, c.hpMax); T(17, c.hitDice, "Hit Dice"); T(19, c.pb);
    T(26, c.init); T(27, c.speed, "Speed"); T(28, c.size); T(29, c.passive);
    const AB = { STR: [64, 21, 91, "Check Box37"], DEX: [66, 22, 87, "Check Box33"], CON: [67, 24, 86, "Check Box32"],
      INT: [63, 20, 69, "Check Box4"], WIS: [65, 23, 75, "Check Box21"], CHA: [68, 25, 81, "Check Box26"] };
    for (const [a, sc, md, sv, p] of c.abil) { const [s, m, st, cb] = AB[a]; T(s, sc); T(m, md); T(st, sv); check(cb, p); }
    const SK = { Athletics: [92, "Check Box38"], Acrobatics: [88, "Check Box34"], "Sleight of Hand": [89, "Check Box35"], Stealth: [90, "Check Box36"],
      Arcana: [70, "Check Box16"], History: [71, "Check Box17"], Investigation: [72, "Check Box19"], Nature: [73, "Check Box20"], Religion: [74, "Check Box18"],
      "Animal Handling": [76, "Check Box22"], Insight: [77, "Check Box23"], Medicine: [78, "Check Box25"], Perception: [79, "Check Box31"], Survival: [80, "Check Box24"],
      Deception: [82, "Check Box27"], Intimidation: [83, "Check Box28"], Performance: [84, "Check Box30"], Persuasion: [85, "Check Box29"] };
    for (const [l, v, p] of c.skills) { const [t, cb] = SK[l]; T(t, v); check(cb, p === "P" || p === "E"); }
    check("Check Box11", c.inspiration);
    const WROWS = [[30, 31, 32, 33], [34, 35, 36, 37], [38, 39, 40, 41], [42, 43, 44, 45], [46, 47, 48, 49], [50, 51, 52, 53]];
    c.weapons.slice(0, 6).forEach((w, i) => {
      T(WROWS[i][0], w[0], "Weapon: " + w[0]); T(WROWS[i][1], w[1]); T(WROWS[i][2], w[2], "Damage: " + w[0]);
      T(WROWS[i][3], w[3], "Weapon notes: " + w[0], abbr(w[3]));
    });
    if (c.weapons.length > 6) overflow.push({ label: "Weapons & damage cantrips (continued)", text: c.weapons.slice(6).map(w => w.filter(Boolean).join(" | ")).join("\n") });
    const cf = c.classFeatures, half = Math.ceil(cf.length / 2);
    T(54, cf.slice(0, half).join("\n"), "Class features"); T(55, cf.slice(half).join("\n"), "Class features (2)");
    T(57, c.speciesTraits.join("\n"), "Species traits"); T(58, c.feats.join("\n"), "Feats");
    ["Light", "Medium", "Heavy", "Shield"].forEach((a, i) => check(["Check Box13", "Check Box14", "Check Box15", "Check Box12"][i], c.armor.includes(a)));
    T(59, c.weaponProf, "Weapon proficiencies"); T(60, c.tools, "Tool proficiencies");

    // page 2
    if (c.spellAbility) {
      const ab = c.spellAbility.split("/")[0].trim();
      const mod = (c.abil.find(x => x[0] === ab) || [])[2];
      T(111, c.spellAbility); T(93, c.spellAbility.includes("/") ? "" : mod); T(94, c.spellDC); T(95, c.spellAtk);
    }
    const SLOT = { 1: 112, 2: 113, 3: 114, 4: 117, 5: 116, 6: 115, 7: 118, 8: 119, 9: 120 };
    for (const [lv, n] of Object.entries(c.slots || {})) if (SLOT[lv]) T(SLOT[lv], n);
    const chosen = (opts.spells || c.spells).slice().sort((a, b) => a.level - b.level);
    const rowY = W.filter(x => /^Text106\./.test(x.f.getName())).map(x => x.y).sort((a, b) => b - a);
    const at = (x0, x1, y) => W.find(w => w.page === 2 && w.x >= x0 && w.x < x1 && Math.abs(w.y - y) < 8);
    chosen.slice(0, rowY.length).forEach((s, i) => {
      const y = rowY[i];
      const set = (x0, x1, v, label, fb) => { const w = at(x0, x1, y); if (w && w.f instanceof PDFLib.PDFTextField) put(w.f, v, label, fb); };
      set(10, 40, s.level === 0 ? "C" : String(s.level));
      set(40, 150, s.name, "Spell: " + s.name);
      set(150, 190, s.time, "Casting time: " + s.name, abbr(s.time));
      set(190, 240, s.range, "Range: " + s.name, abbr(s.range));
      const note = [s.note, s.alwaysPrepared ? "Always prepared" : ""].filter(Boolean).join("; ");
      set(300, 400, note, "Notes: " + s.name, note.replace("Always prepared", "Always prep."));
      const box = (x0, x1, on) => { const w = at(x0, x1, y + 3); if (on && w && w.f instanceof PDFLib.PDFCheckBox) w.f.check(); };
      box(238, 255, s.C); box(258, 275, s.R); box(278, 295, s.M);
    });
    if (chosen.length > rowY.length) overflow.push({
      label: "Cantrips & prepared spells (continued)",
      text: chosen.slice(rowY.length).map(s => [s.level === 0 ? "Cantrip" : "Level " + s.level, s.name, s.time, s.range,
        [s.C ? "C" : "", s.R ? "R" : "", s.M ? "M" : ""].filter(Boolean).join(" "), s.note].filter(Boolean).join("  |  ")).join("\n"),
    });
    T(96, c.appearance, "Appearance"); T(97, c.backstory, "Backstory & personality"); T(100, c.alignment, "Alignment");
    T(98, c.languages, "Languages"); T(99, c.equipment.join("; "), "Equipment");
    c.attuned.slice(0, 3).forEach((a, i) => { T(101 + i, a, "Attuned item"); check("Check Box" + (249 + i), true); });
    T(226, c.coins.CP); T(267, c.coins.SP); T(268, c.coins.EP); T(269, c.coins.GP); T(270, c.coins.PP);

    // continuation pages: two columns, a new page whenever one is full; nothing is dropped
    if (overflow.length) {
      const colW = 255, xs = [40, 317], L = 10.5, top = 740, bottom = 40;
      let pg, col = 0, y = top;
      const newPage = () => {
        pg = doc.addPage([612, 792]);
        pg.drawText(safe(c.name || "Character") + " - continued", { x: 40, y: 760, size: 12, font });
        col = 0; y = top;
      };
      const nextCol = () => { if (col === 0) { col = 1; y = top; } else newPage(); };
      newPage();
      for (const ov of overflow) {
        if (y - 30 < bottom) nextCol();
        for (const line of wrap(safe(ov.label), 10, colW)) { pg.drawText(line, { x: xs[col], y, size: 10, font }); y -= 13; }
        for (const para of safe(ov.text).split("\n")) for (const line of wrap(para, 8, colW - 4)) {
          if (y < bottom) nextCol();
          pg.drawText(line, { x: xs[col] + 4, y, size: 8, font }); y -= L;
        }
        y -= 8;
      }
    }
    // Only text fields get new appearances; checkboxes keep the sheet's own dots and diamonds.
    for (const fld of form.getFields()) if (fld instanceof PDFLib.PDFTextField) fld.updateAppearances(font);
    const bytes = await doc.save({ updateFieldAppearances: false });
    return { bytes, overflow: overflow.map(o => o.label), replaced: [...replaced], pages: doc.getPageCount() };
  }

  const api = { read, check, convert, fill, abbr, RITUALS, REQUIRED };
  if (typeof module === "object" && module.exports) module.exports = api; else root.Sheet = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
