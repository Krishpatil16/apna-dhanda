// v10.15.3 label fixes (overnight QA): (1) salon Today header "N waiting" = the ⏳ Waiting tile, online requests counted apart;
// (2) owner order buttons name the ACTION ("Accept"), never the state it leads to ("Accepted"), kirana + food + salon, EN + हिंदी.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const S = f => readFileSync(join(here, "..", "site", f), "utf8");
const grab = (src, name) => { const m = src.match(new RegExp(`const ${name} = (\\{.*\\});`)); assert.ok(m, name); return vm.runInNewContext(`(${m[1]})`); };
const J = x => JSON.parse(JSON.stringify(x));
const profiles = () => { const ctx = {}; vm.runInNewContext(S("type-profile.js"), ctx); return ctx.AK_PROFILE; };

test("v10.15.3: every classic order button has an action label (Accept, not Accepted), in EN and हिंदी, for kirana and food", () => {
  const a = S("admin.js"), NEXT = grab(a, "NEXT"), ACT = grab(a, "ACT"), ST = grab(a, "ST"), P = profiles();
  assert.deepEqual(J(ACT.accept), ["स्वीकार करें", "Accept"]);
  for (const type of ["kirana", "restaurant"]) {
    const pa = Object.assign({}, ACT, P.profileFor(type).actions || {});
    for (const [from, list] of Object.entries(NEXT)) for (const [to, , , key] of list) {
      assert.ok(key && pa[key], `${type} ${from}→${to} has an action label`);
      const [hi, en] = pa[key];
      assert.notEqual(en, ST[to][1], `${type} ${from}→${to}: button must not read the state "${ST[to][1]}"`);
      assert.notEqual(hi, ST[to][0], `${type} ${from}→${to}: Hindi button must not read the state "${ST[to][0]}"`);
      assert.doesNotMatch(en, /^(Accepted|Preparing|Ready|Out for delivery|Delivered)$/);
    }
  }
  assert.deepEqual(J(P.profileFor("restaurant").actions.prep), ["बनाना शुरू करें", "Start cooking"]);
  assert.equal(P.profileFor("kirana").actions, undefined); // kirana uses admin.js ACT as is
  // the button uses the action word; the badge and the after-tap toast still show the state
  assert.match(a, /pa = Object\.assign\(\{\}, ACT, PROF\(\)\.actions \|\| \{\}\)/);
  assert.match(a, /\$\{ico\[ak\] \|\| ic\} \$\{esc\(ak && pa\[ak\] \? L\(\.\.\.pa\[ak\]\) : stName\(s\)\)\}<\/button>/);
  assert.match(a, /toast\(stName\(to\)\)/);
});

test("v10.15.3: salon buttons stay Start service → Complete, and a pending online request shows ✅ Accept", () => {
  const P = profiles().profileFor("salon"), a = S("admin.js");
  assert.deepEqual(J(P.actions.start), ["सेवा शुरू", "Start service"]); assert.deepEqual(J(P.actions.complete), ["पूरा करें", "Complete"]);
  assert.match(a, /data-queue="\$\{o\.id\}">✅ \$\{L\("स्वीकार करें","Accept"\)\}/);
});

test("v10.15.3: salon header 'N waiting' is the Waiting tile's number; pending online requests show as 'N requests', never as waiting", () => {
  const a = S("admin.js");
  assert.match(a, /const nWait = queue\.filter\(o => o\.status === "pending"\)\.length;\n\s*salonHead\(nWait, reqs\.length\);\n\s*\$\("#tbWait"\)\.textContent = nWait;/);
  assert.doesNotMatch(a, /salonHead\(queue\.filter\(o => o\.status === "pending"\)\.length \+ reqs\.length\)/);
  // run the header in a tiny DOM stand-in
  const fn = a.match(/function salonHead\(waiting, requests\)\{[\s\S]*?\n  \}\n/)[0];
  const cases = { en: [[0, 2, "2 requests ·"], [1, 1, "1 request ·"], [3, 0, "3 waiting ·"], [0, 0, "0 waiting ·"]],
                  hi: [[0, 2, "2 नई रिक्वेस्ट ·"], [1, 1, "1 नई रिक्वेस्ट ·"], [3, 0, "3 इंतज़ार में ·"], [0, 0, "0 इंतज़ार में ·"]] };
  for (const lang of ["en", "hi"]) {
    const greet = { innerHTML: "" }, store = {};
    const ctx = { AK: { lang }, L: (h, e) => lang === "en" ? e : h, esc: s => String(s), shopType: () => "salon",
      document: { body: { classList: { toggle(){} } }, querySelector: () => null }, $: s => s === "#aGreet" ? greet : s === "#aStore" ? store : null, Date };
    vm.runInNewContext(fn, ctx);
    for (const [w, r, want] of cases[lang]) {
      vm.runInContext(`salonHead(${w}, ${r})`, ctx); assert.ok(greet.innerHTML.includes(want), `${lang} ${w}/${r}: ${greet.innerHTML}`);
      if (r) assert.ok(!/waiting|इंतज़ार/.test(greet.innerHTML), "a request is never called waiting: " + greet.innerHTML);
      vm.runInContext(`salonHead()`, ctx); assert.ok(greet.innerHTML.includes(want), "a bare repaint (language switch) keeps the counts");
    }
  }
});
