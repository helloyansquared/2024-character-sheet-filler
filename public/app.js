/* Page logic for 2024 Character Sheet Filler. Everything happens in this tab; see core.js. */
(function () {
  "use strict";
  const BLANK_URL = "https://media.dndbeyond.com/compendium-images/free-rules/ph/character-sheet.pdf";
  const ROWS = 30;
  const $ = id => document.getElementById(id);
  const step = (name, detail) => { try { window.Found && Found.step(name, detail); } catch (e) { /* counting never blocks the tool */ } };
  const state = { blank: null, c: null, picked: new Set(), fileName: "" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])); }
  function setMsg(el, html, kind) { el.innerHTML = html; el.className = "msg" + (kind ? " " + kind : ""); }
  const readFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f); });

  // ------------------------------------------------------------- step 1: blank sheet
  async function validBlank(bytes) {
    const doc = await PDFLib.PDFDocument.load(bytes);
    const have = new Set(doc.getForm().getFields().map(f => f.getName()));
    return Sheet.REQUIRED.every(n => have.has(n));
  }
  function blankReady(how) {
    $("step1").classList.add("done");
    $("blankStatus").innerHTML = how === "auto" ? "Loaded the official blank 2024 sheet from D&amp;D Beyond. ✓" : "Got the blank 2024 sheet. ✓";
    $("blankFallback").hidden = true;
    step("blank", how);
    refresh();
  }
  async function loadBlankAuto() {
    try {
      const r = await fetch(BLANK_URL, { mode: "cors", credentials: "omit" });
      if (!r.ok) throw new Error("http-" + r.status);
      const b = new Uint8Array(await r.arrayBuffer());
      if (!(await validBlank(b))) throw new Error("bad");
      state.blank = b; blankReady("auto");
    } catch (e) {
      $("blankStatus").textContent = "Step 1 needs one extra click:";
      $("blankFallback").hidden = false;
      step("blank", "auto-fail");
    }
  }
  async function takeBlank(file) {
    if (!file) return;
    try {
      const b = await readFile(file);
      if (!(await validBlank(b))) {
        $("blankStatus").innerHTML = "That PDF isn't the fillable 2024 sheet. Use the one from the link below (D&amp;D Beyond Free Rules); the first PHB download isn't fillable.";
        step("blank", "manual-bad"); return;
      }
      state.blank = b; blankReady("manual");
    } catch (e) {
      $("blankStatus").textContent = "Couldn't open that file as a PDF. Try downloading the blank sheet again.";
      step("blank", "manual-err");
    }
  }

  // ------------------------------------------------------------- step 2: character PDF
  const ERR = {
    "not-pdf": "That file isn't a PDF. Export your character from D&amp;D Beyond with <b>Export to PDF</b>.",
    "encrypted": "This PDF is password-protected, so its fields can't be read. Export it again from D&amp;D Beyond.",
    "no-fields": "This PDF has no form fields. It's probably a printed or “Save as PDF” copy. Download it again straight from D&amp;D Beyond's <b>Export to PDF</b>.",
    "not-ddb": "This doesn't look like a character PDF exported from D&amp;D Beyond. Other sheets aren't supported yet.",
    "empty": "The character fields in this PDF are empty. D&amp;D Beyond sometimes exports a blank sheet; try exporting it again.",
    "unreadable": "Couldn't read this PDF's structure. If it came from D&amp;D Beyond's Export to PDF, please <a href=\"mailto:hello@yansquared.com?subject=2024%20sheet%20filler\">send it to us</a> so we can fix it.",
  };
  const WARN = {
    "multiclass": "Multiclass: the Class box shows all your classes and the total level; check the spellcasting boxes on page 2.",
    "pact": "Warlock pact slots haven't been checked against a real export yet. Please check the spell slots.",
    "high-level": "Level 10+ hasn't been checked against a real export yet. Please look over page 2.",
  };
  async function takeCharacter(bytes, label) {
    const msg = $("charMsg");
    let rows;
    try { rows = Sheet.read(bytes); } catch (e) {
      const code = ERR[e.message] ? e.message : "unreadable";
      setMsg(msg, ERR[code], "bad"); step("upload", "fail-" + code); return;
    }
    const code = Sheet.check(rows);
    if (code) { setMsg(msg, ERR[code], "bad"); step("upload", "fail-" + code); return; }
    let c;
    try { c = Sheet.convert(rows); } catch (e) { setMsg(msg, ERR.unreadable, "bad"); step("upload", "fail-convert"); return; }
    state.c = c;
    const sub = c.subclass ? " (" + esc(c.subclass) + ")" : "";
    const warns = c.warnings.map(w => "<li>" + WARN[w] + "</li>").join("");
    setMsg(msg, "<div class=\"card\"><b>" + esc(c.name) + "</b> · " + esc(c.class) + " " + esc(c.level) + sub + " · " + esc(c.species) + " · " + esc(c.background)
      + "<br><span class=\"small\">AC " + esc(c.ac) + " · HP " + esc(c.hpMax) + " · " + c.spells.length + " spells · " + c.weapons.length + " attacks · " + c.equipment.length + " items</span></div>"
      + (warns ? "<ul class=\"warn\">" + warns + "</ul>" : ""), "ok");
    $("step2").classList.add("done");
    step("upload", label);
    buildSpells();
    refresh();
  }
  async function takeCharFile(file) {
    if (!file) return;
    state.fileName = file.name;
    try { await takeCharacter(await readFile(file), "ok"); } catch (e) { setMsg($("charMsg"), ERR.unreadable, "bad"); step("upload", "fail-read"); }
  }

  // ------------------------------------------------------------- step 3: spells
  function buildSpells() {
    const c = state.c, box = $("spellBox");
    state.picked = new Set();
    if (!c.spells.length) {
      box.hidden = true; $("spellHint").textContent = "No spells on this character. Nothing to choose.";
      $("step3").classList.add("done"); return;
    }
    const allFit = c.spells.length <= ROWS;
    c.spells.forEach((s, i) => { if (allFit || s.level === 0 || s.alwaysPrepared) state.picked.add(i); });
    $("spellHint").innerHTML = allFit
      ? "All " + c.spells.length + " spells fit on the sheet, so they're all ticked. Untick any you don't want printed."
      : "Your export lists <b>" + c.spells.length + "</b> spells, probably your whole class list, because D&amp;D Beyond's PDF doesn't say which ones you prepared. Cantrips and always-prepared spells are ticked; <b>tick the spells you have prepared</b>.";
    if (!allFit) step("spells", "pick");
    const groups = {};
    c.spells.forEach((s, i) => (groups[s.level] = groups[s.level] || []).push(i));
    let html = "<div class=\"count\" id=\"spellCount\"></div><div class=\"bar\"><button type=\"button\" class=\"link\" data-all>Tick all</button> · <button type=\"button\" class=\"link\" data-none>Untick all but cantrips &amp; always prepared</button></div>";
    for (const lv of Object.keys(groups).sort((a, b) => a - b)) {
      html += "<fieldset><legend>" + (lv === "0" ? "Cantrips" : "Level " + lv) + (c.slots[lv] ? " <span class=\"small\">(" + c.slots[lv] + " slots)</span>" : "") + "</legend>";
      for (const i of groups[lv]) {
        const s = c.spells[i];
        const tags = [s.C ? "C" : "", s.R ? "R" : "", s.M ? "M" : ""].filter(Boolean).join(" ");
        html += "<label><input type=\"checkbox\" data-i=\"" + i + "\"" + (state.picked.has(i) ? " checked" : "") + "> " + esc(s.name)
          + (tags ? " <span class=\"tag\">" + tags + "</span>" : "") + (s.alwaysPrepared ? " <span class=\"tag gold\">always</span>" : "")
          + " <span class=\"src\">" + esc(s.source.replace(/\s*\(Always Prepared\)/, "")) + "</span></label>";
      }
      html += "</fieldset>";
    }
    box.innerHTML = html; box.hidden = false;
    count();
  }
  function count() {
    const n = state.picked.size, el = $("spellCount");
    if (!el) return;
    el.innerHTML = "<b>" + n + "</b> ticked · " + Math.min(n, ROWS) + " of " + ROWS + " rows on the sheet" + (n > ROWS ? " · <b>" + (n - ROWS) + "</b> on the extra page" : "");
    $("step3").classList.toggle("done", n > 0);
  }
  $("spellBox").addEventListener("change", e => {
    const i = e.target.getAttribute && e.target.getAttribute("data-i"); if (i == null) return;
    if (e.target.checked) state.picked.add(+i); else state.picked.delete(+i);
    count();
  });
  $("spellBox").addEventListener("click", e => {
    if (!e.target.hasAttribute) return;
    const all = e.target.hasAttribute("data-all"), none = e.target.hasAttribute("data-none");
    if (!all && !none) return;
    state.c.spells.forEach((s, i) => { if (all || s.level === 0 || s.alwaysPrepared) state.picked.add(i); else state.picked.delete(i); });
    $("spellBox").querySelectorAll("input[data-i]").forEach(cb => { cb.checked = state.picked.has(+cb.getAttribute("data-i")); });
    count();
  });

  // ------------------------------------------------------------- step 4: make + download
  function refresh() {
    $("goBtn").disabled = !(state.blank && state.c);
    $("goBtn").title = !state.blank ? "Load the blank sheet first (step 1)" : !state.c ? "Add your character PDF (step 2)" : "";
  }
  $("goBtn").addEventListener("click", async () => {
    const btn = $("goBtn"), msg = $("doneMsg");
    btn.disabled = true; btn.textContent = "Filling the sheet…";
    try {
      const chosen = state.c.spells.filter((s, i) => state.picked.has(i));
      const out = await Sheet.fill(PDFLib, state.blank, state.c, { spells: chosen });
      const name = (state.c.name || "character").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "character";
      const url = URL.createObjectURL(new Blob([out.bytes], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = name + "-2024-sheet.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      let note = "Done: <b>" + esc(a.download) + "</b> (" + out.pages + " pages). ";
      if (out.pages > 2) note += "Page 3 has what didn't fit: " + esc(out.overflow.join(", ")) + ". ";
      if (out.replaced.length) note += "Some characters (" + esc(out.replaced.join(" ")) + ") aren't in the sheet's font and show as “?”; you can retype them in a PDF app. ";
      note += "<a href=\"" + url + "\" download=\"" + esc(a.download) + "\">Download again</a>";
      setMsg(msg, note, "ok");
      $("step4").classList.add("done");
      step("download", out.pages > 2 ? "extra" : "ok");
      try { window.Found && Found.ask(); } catch (e) { /* optional */ }
    } catch (e) {
      setMsg(msg, "Something went wrong while filling the sheet" + (e && e.message === "bad-blank" ? " (the blank sheet isn't the fillable 2024 version)" : "")
        + ". Please <a href=\"mailto:hello@yansquared.com?subject=2024%20sheet%20filler\">tell us</a>.", "bad");
      step("download", "fail");
    } finally { btn.textContent = "Make my 2024 sheet"; refresh(); }
  });

  // ------------------------------------------------------------- inputs: choose + drag and drop
  function wireDrop(label, input, take) {
    input.addEventListener("change", () => take(input.files[0]));
    ["dragenter", "dragover"].forEach(ev => label.addEventListener(ev, e => { e.preventDefault(); label.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => label.addEventListener(ev, e => { e.preventDefault(); label.classList.remove("over"); }));
    label.addEventListener("drop", e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) take(f); });
  }
  wireDrop($("blankDrop"), $("blankInput"), takeBlank);
  wireDrop($("charDrop"), $("charInput"), takeCharFile);
  // dropping a file anywhere else shouldn't make the browser navigate away
  window.addEventListener("dragover", e => e.preventDefault());
  window.addEventListener("drop", e => e.preventDefault());
  $("sampleBtn").addEventListener("click", async () => {
    try {
      const r = await fetch("/sample/rowan-hale-ddb-format.pdf");
      await takeCharacter(new Uint8Array(await r.arrayBuffer()), "sample");
      $("charMsg").insertAdjacentHTML("afterbegin", "<p class=\"small\">Sample: a made-up character, not a real export.</p>");
    } catch (e) { setMsg($("charMsg"), "Couldn't load the sample.", "bad"); }
  });

  refresh();
  loadBlankAuto();
})();
