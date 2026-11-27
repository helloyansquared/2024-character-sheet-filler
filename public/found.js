/* found.js: privacy-friendly "where do visitors come from" counter. No cookies, no IDs, no third parties.
   - Found.land(): once per tab session, sends {t:"land", src, path} to /api/hit, where src is the site that
     sent the visit (chatgpt, perplexity, google, reddit, a hostname, or "direct"). Raw URLs are never sent.
   - Found.event(t): "made" / "saved" / "shared", once per tab session each, same fields as a landing.
   - Found.step(name, detail): other funnel steps ("buy", "paid"), stored as "s:<name>" with a short detail word.
   - Found.ask(): after something worked, shows a skippable one-question card ("How did you find us?"),
     at most once per browser. The answer and the optional "what did you search or ask?" go to /api/hit too. */
(function () {
  var SITE = location.hostname.replace(/^www\./, "");
  var AI = [["chatgpt", /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/], ["perplexity", /(^|\.)perplexity\.ai$/],
    ["claude", /(^|\.)claude\.ai$/], ["gemini", /^gemini\.google\.com$/], ["copilot", /(^|\.)copilot\.(microsoft|cloud\.microsoft)\.com$|^copilot\.microsoft\.com$/],
    ["meta-ai", /(^|\.)meta\.ai$/], ["deepseek", /(^|\.)deepseek\.com$/], ["grok", /(^|\.)grok\.com$/], ["you", /(^|\.)you\.com$/],
    ["google", /(^|\.)google\.[a-z.]+$/], ["bing", /(^|\.)bing\.com$/], ["duckduckgo", /(^|\.)duckduckgo\.com$/],
    ["reddit", /(^|\.)reddit\.com$/], ["tumblr", /(^|\.)tumblr\.com$/], ["x", /(^|\.)(x\.com|t\.co|twitter\.com)$/]];
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function send(d) {
    d.site = SITE; var body = JSON.stringify(d);
    try { if (navigator.sendBeacon && navigator.sendBeacon("/api/hit", new Blob([body], { type: "application/json" }))) return; } catch (e) {}
    try { fetch("/api/hit", { method: "POST", body: body, headers: { "content-type": "application/json" }, keepalive: true }); } catch (e) {}
  }
  function source() {
    var u = new URLSearchParams(location.search).get("utm_source");
    if (u) { u = u.toLowerCase().slice(0, 60); for (var i = 0; i < AI.length; i++) if (AI[i][1].test(u)) return AI[i][0]; return "utm:" + u; }
    var h = ""; try { h = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) {}
    if (!h) return "direct";
    if (h === SITE || h.endsWith("." + SITE)) return null; // moving between our own pages
    for (var j = 0; j < AI.length; j++) if (AI[j][1].test(h)) return AI[j][0];
    return h.slice(0, 60);
  }
  function land() {
    if (ss("found-landed")) return;
    var s = source(); if (s === null) return;
    ss("found-landed", "1"); ss("found-src", s);
    send({ t: "land", src: s, path: location.pathname.slice(0, 80) });
  }
  var shown = false;
  function ask() {
    if (shown || ls("found-asked")) return; shown = true;
    var box = document.createElement("div");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Quick question");
    box.className = "found-ask";
    var opts = ["ChatGPT", "Google", "Another AI", "Reddit", "Tumblr", "A friend", "Other"];
    box.innerHTML = '<button type="button" aria-label="Close" data-x class="fx">×</button>'
      + '<b class="fh">Glad it worked! How did you find this site?</b>'
      + '<div class="fo">' + opts.map(function (o) {
        return '<button type="button" data-a="' + o + '">' + o + '</button>'; }).join("") + '</div>'
      + '<form data-q hidden><label>What did you ask or search for? <span>(optional, no personal details)</span></label>'
      + '<input maxlength="200"><button class="fs">Send</button></form>'
      + '<p class="fn">Anonymous, no cookies. Helps a one-person project know where people come from.</p>';
    var ans = "";
    function done(msg) { ls("found-asked", "1"); box.innerHTML = "<b>" + msg + "</b>"; setTimeout(function () { box.remove(); }, 1800); }
    box.addEventListener("click", function (e) {
      var t = e.target;
      if (t.hasAttribute && t.hasAttribute("data-x")) { ls("found-asked", "1"); send({ t: "ask", src: ss("found-src") || "", ans: "dismissed" }); box.remove(); return; }
      if (t.getAttribute && t.getAttribute("data-a")) {
        var first = !ans; ans = t.getAttribute("data-a");
        if (first) { ls("found-asked", "1"); send({ t: "ask", src: ss("found-src") || "", ans: ans }); }
        box.querySelectorAll("[data-a]").forEach(function (b) { b.classList.toggle("on", b === t); });
        var f = box.querySelector("[data-q]"); f.hidden = false; f.querySelector("input").focus();
      }
    });
    box.querySelector("[data-q]").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = box.querySelector("input").value.trim().slice(0, 200);
      if (q) send({ t: "askq", src: ss("found-src") || "", ans: ans, q: q });
      done("Thank you!");
    });
    setTimeout(function () { document.body.appendChild(box); }, 900);
  }
  // One anonymous note per tab session for each step: "made" (Wrapped opened), "saved", "shared".
  // Same fields as a landing (source site name and page), nothing about the Wrapped itself.
  function event(t) {
    if (!/^(made|saved|shared)$/.test(t) || ss("found-ev-" + t)) return;
    ss("found-ev-" + t, "1");
    send({ t: t, src: ss("found-src") || "", path: location.pathname.slice(0, 80) });
  }
  // Funnel steps: Found.step("blank" | "upload" | "spells" | "download", detail). Stored as t = "s:<step>",
  // with an optional short detail word. Once per tab session per step and detail.
  function step(name, detail) {
    name = String(name || "").toLowerCase(); detail = String(detail || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
    if (!/^[a-z]{2,12}$/.test(name)) return;
    var k = "found-s:" + name + ":" + detail;
    if (ss(k)) return; ss(k, "1");
    send({ t: "s:" + name, src: ss("found-src") || "", path: location.pathname.slice(0, 80), q: detail });
  }
  window.Found = { land: land, ask: ask, event: event, step: step };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", land); else land();
})();
