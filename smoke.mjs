// smoke.mjs — node harness for homestead-month-card
import fs from "node:fs"; import vm from "node:vm";
const src = fs.readFileSync(new URL("./homestead-month-card.js", import.meta.url), "utf8");
// the shadow root counts innerHTML assignments (`_sets`) so the render-dedupe checks can see a swap that should not happen
class HTMLElement { constructor() { this._sr = null; this.style = {}; this._sets = 0; } attachShadow() { const self = this; let html = ""; this._sr = { get innerHTML() { return html; }, set innerHTML(v) { html = v; self._sets++; }, addEventListener() {} }; return this._sr; } get shadowRoot() { return this._sr; } dispatchEvent() {} }
const defs = {};
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FakeDate._now); } static now() { return FakeDate._now; } }
FakeDate._now = new Date(2026, 8, 5, 12, 0, 0).getTime(); // Sat Sep 5 2026
// a stand-in for DOM elements on a tap path: `matches` understands the four selectors the card uses
class Element { constructor(ds, chip) { this.dataset = ds || {}; this._chip = !!chip; } matches(sel) { if (sel === "[data-go]") return "go" in this.dataset; if (sel === "[data-nav]") return "nav" in this.dataset; if (sel === "[data-ev]") return "ev" in this.dataset; if (sel === "[data-day]") return "day" in this.dataset; if (sel === ".chip[data-cal]") return this._chip && "cal" in this.dataset; return false; } }
const nav = { pushed: [], events: [] };
const ctx = { HTMLElement, Element, customElements: { define: (n, c) => (defs[n] = c) }, document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }, console, setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout, Date: FakeDate, Math, encodeURIComponent, parseInt, addEventListener() {}, removeEventListener() {}, history: { pushState: (s, t, p) => nav.pushed.push(p) }, dispatchEvent: (e) => nav.events.push(e.type), Event: class { constructor(t) { this.type = t; } } };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const Card = defs["homestead-month-card"];
let fails = 0;
const check = (name, cond) => { console.log((cond ? "ok  " : "FAIL") + " " + name); if (!cond) fails++; };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const EV = {
  "calendar.henry": [
    { summary: "Popcorn sales · Maricopa Fry's", start: { dateTime: "2026-09-11T16:00:00-07:00" }, end: { dateTime: "2026-09-11T18:00:00-07:00" } },
    { summary: "6:30 Cub Scouts", start: { dateTime: "2026-09-08T18:30:00-07:00" }, end: { dateTime: "2026-09-08T19:30:00-07:00" } },
    { summary: "Soccer practice", start: { dateTime: "2026-09-10T16:00:00-07:00" }, end: { dateTime: "2026-09-10T17:00:00-07:00" } },
  ],
  "calendar.celebrations": [
    { summary: "Sarah's Birthday", start: { date: "2026-09-06" }, end: { date: "2026-09-07" } },
    { summary: "Wedding Anniversary", start: { date: "2026-09-21" }, end: { date: "2026-09-22" } },
    { summary: "Dentist appointment", start: { dateTime: "2026-09-15T09:15:00-07:00" }, end: { dateTime: "2026-09-15T10:00:00-07:00" } },
  ],
  "calendar.family": [
    { summary: "NO SCHOOL", start: { date: "2026-09-28" }, end: { date: "2026-10-03" } },
    { summary: "Midway sleepover - San Diego weekend", start: { dateTime: "2026-09-25T00:00:00-07:00" }, end: { dateTime: "2026-09-27T23:45:00-07:00" } },
    { summary: "Late shift", start: { dateTime: "2026-09-08T22:00:00-07:00" }, end: { dateTime: "2026-09-09T02:00:00-07:00" } },
    ...Array.from({ length: 9 }, (_, i) => ({ summary: "Busy thing " + (i + 1), start: { dateTime: `2026-09-17T${String(8 + i).padStart(2, "0")}:00:00-07:00` }, end: { dateTime: `2026-09-17T${String(9 + i).padStart(2, "0")}:00:00-07:00` } })),
  ],
};
const hass = { callApi: async (m, url) => { const ent = url.split("?")[0].replace("calendars/", ""); return EV[ent] || []; }, states: {} };
const cfg = { calendars: [
  { entity: "calendar.henry", name: "Henry", color: "#a83f39" },
  { entity: "calendar.celebrations", name: "Celebrations", color: "#c76b8f" },
  { entity: "calendar.family", name: "Family", color: "#5f7e94" },
] };

check("card registered", typeof Card === "function");
check("setConfig rejects missing calendars", (() => { try { new Card().setConfig({}); return false; } catch (e) { return /calendars/.test(e.message); } })());

const el = new Card(); el.setConfig(cfg); el.hass = hass; await tick(); await tick();
const h = el.shadowRoot.innerHTML;
check("masthead + month", h.includes("The Homestead Times") && h.includes("SEPTEMBER 2026") && h.includes("CALENDAR &amp; ALMANACK"));
check("35 day headers, 5 week rows", (h.match(/class="ch[" ]/g) || []).length === 35 && (h.match(/class="week">/g) || []).length === 5);
check("legend chips", (h.match(/class="chip"/g) || []).length === 3);
check("day-count agate removed", !h.includes("250/115") && !h.includes('class="agate"'));
check("timed multi-day → ONE continuous lane Fri–Sun with 12a start time, plane once", (h.match(/Midway sleepover/g) || []).length === 1 && /grid-column:5\/8;grid-row:4"><span class="txt"><b>12a<\/b> Midway sleepover/.test(h) && (h.match(/M8 19 l16 -7/g) || []).length === 1);
check("overnight timed event (10p–2a) is one lane over two days", (h.match(/Late shift/g) || []).length === 1 && /grid-column:2\/4;grid-row:4"><span class="txt"><b>10p<\/b> Late shift/.test(h));
check("Labor Day printed Sep 7 with star stamp", h.includes("Labor Day") && (h.match(/#st|star|hs/g) || []).length > 0 && h.includes('class="stamp hs"'));
check("today overlay + TODAY tag on the 5th", (h.match(/class="dovl today"/g) || []).length === 1 && h.includes(">TODAY<"));
check("week starts Monday", /class="dow"><div>MONDAY<\/div>/.test(h) && h.includes("<div>SUNDAY</div></div>"));
check("past days struck with hand-drawn X (incl. out-month lead-in)", (h.match(/class="xs"/g) || []).length === 5 && (h.match(/<path d="M\d/g) || []).length >= 10);
check("timed event bar: 4p popcorn", h.includes("<b>4p</b> Popcorn sales · Maricopa Fry&#39;s"));
check("6:30p scouts", h.includes("<b>6:30p</b> 6:30 Cub Scouts"));
check("birthday bar renders all-day in celebrations color", /class="ev ad"[^>]*--hl:#c76b8f[\s\S]{0,200}Sarah&#39;s Birthday/.test(h));
check("single-day all-day events sit in their own bottom grid row (row 3)", /class="adcell[^"]*" style="grid-column:7;grid-row:3"><div class="ev ad"[^>]*--hl:#c76b8f[\s\S]{0,120}Sarah&#39;s Birthday/.test(h) && (h.match(/class="adcell/g) || []).length === 35);
check("anniversary → rings glyph present", h.includes("Wedding Anniversary") && h.includes('<circle cx="13" cy="17"'));
check("spans: 3 continuous lanes with aligned start+end edges; NO SCHOOL over Mon–Fri; bell once", (h.match(/class="lane lstart lend"/g) || []).length === 3 && (h.match(/>NO SCHOOL</g) || []).length === 1 && /grid-column:1\/6;grid-row:4"><span class="txt">NO SCHOOL/.test(h) && (h.match(/M16 9 c-4 0/g) || []).length === 1);
check("soccer → ball, dentist → cross", h.includes('cx="16" cy="16" r="7"') && h.includes('M16 11.5 v9'));
check("overflow: and 2 more", h.includes("and 2 more, see inside"));
check("rubber filter def present once", (h.match(/feTurbulence/g) || []).length === 1);

el._nav(1); await tick(); await tick();
const h2 = el.shadowRoot.innerHTML;
check("nav +1: OCTOBER 2026 + return button, no today cell", h2.includes("OCTOBER 2026") && h2.includes('class="ret" data-nav="0"') && h2.includes("RETURN TO THE PRESENT") && !/class="dovl today"/.test(h2));
check("nav +1: no agates in October either", !/\d+\/\d+</.test(h2.split('class="grid"')[1] || ""));
check("nav +1: Halloween printed", h2.includes("Halloween"));
el._nav(0, true); await tick(); await tick();
const h3 = el.shadowRoot.innerHTML;
check("HOME returns: September + today box back, return button gone", h3.includes("SEPTEMBER 2026") && /class="dovl today"/.test(h3) && !h3.includes("RETURN TO THE PRESENT"));
check("footer carries the swipe/tap and key hints", h3.includes("Swipe or tap PREV / NEXT to turn the month") && h3.includes("Keys: ← → (PgUp PgDn, p n) turn the month, Shift+← → a year, Home or t returns."));
check("masthead carries THE PAPER button to the front page", /<button class="nav paper" data-go="\/the-almanac\/front"[^>]*>‹ THE PAPER<\/button><span class="rule"><\/span>/.test(h3));
{ const path = (ds) => ({ composedPath: () => [new ctx.Element(ds)] });
  el._onTap(path({ go: "/the-almanac/front" }));
  check("tap THE PAPER → pushState + location-changed, month untouched", nav.pushed[nav.pushed.length - 1] === "/the-almanac/front" && nav.events.includes("location-changed") && el._offset === 0);
  const cp = new Card(); cp.setConfig(Object.assign({ paper_path: "/lovelace/0", paper_label: "HOME" }, cfg)); cp.hass = hass; await tick(); await tick();
  check("paper_path/paper_label configurable", /data-go="\/lovelace\/0"[^>]*>‹ HOME</.test(cp.shadowRoot.innerHTML));
  const np = new Card(); np.setConfig(Object.assign({ paper_path: "" }, cfg)); np.hass = hass; await tick(); await tick();
  check("paper_path: '' hides the button", !np.shadowRoot.innerHTML.includes("data-go="));
  const hostile = new Card(); hostile.setConfig(Object.assign({ paper_label: "<b>x</b>" }, cfg)); hostile.hass = hass; await tick(); await tick();
  check("hostile paper label prints escaped", hostile.shadowRoot.innerHTML.includes("‹ &lt;b&gt;x&lt;/b&gt;</button>")); }
check("masthead carries PREV and NEXT buttons around the month", /<button class="nav" data-nav="-1"[^>]*>‹ PREV<\/button><span class="month">SEPTEMBER 2026<\/span><button class="nav" data-nav="1"[^>]*>NEXT ›<\/button>/.test(h3));
// ---- month controls: tapping the buttons, swiping the grid, year jumps, read-only walls
{
  const path = (ds) => ({ composedPath: () => [new ctx.Element(ds)] });
  el._onTap(path({ nav: "1" })); await tick(); await tick();
  check("tap NEXT → October", el._offset === 1 && el.shadowRoot.innerHTML.includes("OCTOBER 2026"));
  el._onTap(path({ nav: "-1" })); el._onTap(path({ nav: "-1" })); await tick(); await tick();
  check("tap PREV twice → August", el._offset === -1 && el.shadowRoot.innerHTML.includes("AUGUST 2026"));
  el._onTap(path({ nav: "0" })); await tick(); await tick();
  check("tap RETURN → September, today boxed", el._offset === 0 && /class="dovl today"/.test(el.shadowRoot.innerHTML));
  el._swipeStart({ touches: [{ clientX: 400, clientY: 300 }] }); el._swipeEnd({ changedTouches: [{ clientX: 250, clientY: 310 }] }); await tick(); await tick();
  check("swipe left → next month", el._offset === 1);
  el._swipeStart({ touches: [{ clientX: 200, clientY: 300 }] }); el._swipeEnd({ changedTouches: [{ clientX: 420, clientY: 280 }] }); await tick();
  check("swipe right → back", el._offset === 0);
  el._swipeStart({ touches: [{ clientX: 200, clientY: 300 }] }); el._swipeEnd({ changedTouches: [{ clientX: 230, clientY: 310 }] });
  check("a 30px nudge is not a swipe", el._offset === 0);
  el._swipeStart({ touches: [{ clientX: 200, clientY: 100 }] }); el._swipeEnd({ changedTouches: [{ clientX: 300, clientY: 400 }] });
  check("a mostly-vertical drag (scroll) is not a swipe", el._offset === 0);
  el.connectedCallback();
  el._key({ key: "ArrowRight", shiftKey: true, target: { tagName: "DIV" } }); await tick();
  check("Shift+→ jumps a year", el._offset === 12 && el.shadowRoot.innerHTML.includes("SEPTEMBER 2027"));
  el._key({ key: "ArrowLeft", shiftKey: true, target: { tagName: "DIV" } }); el._key({ key: ".", target: { tagName: "DIV" } }); el._key({ key: ",", target: { tagName: "DIV" } }); el._key({ key: "N", target: { tagName: "DIV" } });
  check("Shift+← back a year; . , N step by one", el._offset === 1);
  el._key({ key: "ArrowRight", ctrlKey: true, target: { tagName: "DIV" } });
  check("Ctrl+→ (a browser shortcut) is ignored", el._offset === 1);
  el._key({ key: "t", target: { tagName: "DIV" } }); await tick();
  check("t returns to the present", el._offset === 0);
  el._nav(1); el._openDay("2026-10-05"); el._nav(0, true);
  check("turning the page closes an open clipping", el._pop === null);
  const ro = new Card(); ro.setConfig(Object.assign({ tap: false }, cfg)); ro.hass = hass; await tick(); await tick();
  ro._onTap(path({ nav: "1" })); await tick(); await tick();
  check("tap: false still turns the month from the buttons", ro._offset === 1 && ro.shadowRoot.innerHTML.includes('data-nav="-1"'));
  ro._onTap(path({ day: "2026-10-05" }));
  check("…but still opens no clippings", !ro._pop);
  const nn = new Card(); nn.setConfig(Object.assign({ navigation: false }, cfg)); nn.hass = hass; await tick(); await tick();
  nn._swipeStart({ touches: [{ clientX: 400, clientY: 300 }] }); nn._swipeEnd({ changedTouches: [{ clientX: 250, clientY: 310 }] });
  check("navigation: false hides the buttons and ignores swipes; keys still work", !nn.shadowRoot.innerHTML.includes("data-nav") && nn._offset === 0 && (nn.connectedCallback(), nn._key({ key: "ArrowRight", target: { tagName: "DIV" } }), nn._offset === 1));
  nn.disconnectedCallback(); ro.disconnectedCallback();
}
check("big cake stamp on the birthday cell", (h3.match(/class="bigstamp"/g) || []).length === 1 && h3.includes('class="stamp big"'));
check("inline cake suppressed when big cake present", !/Sarah&#39;s Birthday<\/span><svg class="stamp"/.test(h3));
check("sizes in vmin, page height stays 100vh", h3.includes("2.2vmin") && h3.includes("height: 100vh"));
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
// ---- tap: clippings, day lists, isolation ----
{
  const el2 = new Card(); el2.setConfig(cfg); el2.hass = hass; await tick(); await tick();
  const h4 = el2.shadowRoot.innerHTML;
  check("events and lanes carry data-ev/data-cal; headers and overflow carry data-day; chips carry data-cal", /class="ev[^"]*" data-ev="calendar\.henry\|[^"]+" data-cal="calendar\.henry"/.test(h4) && /class="lane[^"]*" data-ev="calendar\.family\|[^"]+" data-cal="calendar\.family"/.test(h4) && (h4.match(/class="ch[" ][^>]*data-day="2026-\d\d-\d\d"/g) || []).length === 35 && /class="more" data-day="2026-09-17"/.test(h4) && (h4.match(/class="chip" data-cal="calendar\./g) || []).length === 3);
  const popcornId = Object.keys(el2._byId).find((k) => el2._byId[k].sum.startsWith("Popcorn"));
  el2._openEvent(popcornId);
  const p1 = el2._pop.html;
  check("event clipping: kicker with calendar/date/time, headline, stamp", p1.includes("HENRY · Friday, September 11 · 4p – 6p".toUpperCase()) === false && /class="kick">Henry · Friday, September 11 · 4p – 6p</.test(p1) && p1.includes('class="ttl">Popcorn sales · Maricopa Fry&#39;s<') && p1.includes('class="clipstamp"') === false);
  const midwayId = Object.keys(el2._byId).find((k) => /Midway/.test(el2._byId[k].sum));
  el2._openEvent(midwayId);
  const p2 = el2._pop.html;
  check("span clipping: date range with nights and start time, plane stamp", /class="kick">Family · Sep 25 – Sep 27 · 2 nights · from 12a</.test(p2) && p2.includes('class="clipstamp"'));
  el2._openDay("2026-09-17");
  const p3 = el2._pop.html;
  check("day clipping lists all 9 busy things with times", (p3.match(/class="row" data-ev=/g) || []).length === 9 && /class="kick">THURSDAY · SEPTEMBER 17 · 9 entries</.test(p3) && p3.includes("<b>") === false);
  el2._openDay("2026-09-28");
  check("day clipping includes spans covering the day (NO SCHOOL)", el2._pop.html.includes(">NO SCHOOL<") && el2._pop.html.includes(">all day<"));
  el2._closePop();
  check("close empties the clipping", el2._pop === null);
  el2.connectedCallback(); el2._openEvent(popcornId); el2._key({ key: "Escape", target: { tagName: "DIV" } });
  check("Escape closes the clipping first and leaves the month alone", el2._pop === null && el2._offset === 0);
  el2._isolate("calendar.henry"); check("isolate toggles on", el2._iso === "calendar.henry");
  el2._isolate("calendar.henry"); check("isolate toggles off", el2._iso === null);
  check("tap can be disabled", (() => { const e3 = new Card(); e3.setConfig(Object.assign({ tap: false }, cfg)); return e3._cfg.tap === false; })());
}
console.log(fails ? `\n${fails} FAILED (tap)` : "\ntap checks passed");
// ---- hostile strings, a failing calendar, render dedupe, unchanged fetch, stamp regex, teardown, a config change mid-fetch ----
{
  const hostile = "<img src=x onerror=alert(1)>";
  const hass2 = { states: {}, callApi: async () => [{ summary: hostile, description: hostile + "\nline two", location: hostile, start: { dateTime: "2026-09-12T10:00:00-07:00" }, end: { dateTime: "2026-09-12T11:00:00-07:00" } }] };
  const e = new Card(); e.setConfig(cfg); e.hass = hass2; await tick(); await tick();
  const g = e.shadowRoot.innerHTML;
  check("hostile summary prints escaped in the grid, never raw", g.includes("&lt;img src=x onerror=alert(1)&gt;") && !g.includes("<img src=x"));
  e._openEvent(Object.keys(e._byId)[0]);
  const p = e._pop.html;
  check("hostile summary/location/description print escaped in the clipping, never raw", (p.match(/&lt;img src=x onerror=alert\(1\)&gt;/g) || []).length === 3 && p.includes("line two") && !p.includes("<img src=x"));
}
{
  const e = new Card(); e.setConfig(cfg); let threw = false;
  try { e.hass = { states: {}, callApi: async () => { throw new Error("calendar unavailable"); } }; await tick(); await tick(); } catch (x) { threw = true; }
  const g = e.shadowRoot.innerHTML;
  check("every calendar failing: the grid still prints, no error shell, no NaN/undefined", !threw && g.includes("SEPTEMBER 2026") && (g.match(/class="ch[" ]/g) || []).length === 35 && !g.includes("color:#b00") && !/NaN|undefined/.test(g));
}
{
  const e = new Card(); e.setConfig(cfg); const hass3 = { states: {} };
  e.hass = hass3; e.hass = hass3; await tick();
  check("render dedupe: the same hass twice → exactly one innerHTML assignment", e._sets === 1 && e.shadowRoot.innerHTML.includes("SEPTEMBER 2026"));
}
{
  const evs = [{ summary: "Soccer practice", start: { dateTime: "2026-09-10T16:00:00-07:00" }, end: { dateTime: "2026-09-10T17:00:00-07:00" } }];
  const hass4 = { states: {}, callApi: async () => evs };
  const e = new Card(); e.setConfig(cfg); e.hass = hass4; await tick(); await tick();
  const before = e._sets;
  e._fetchAt = 0; e.hass = hass4; await tick(); await tick();
  check("a refetch that changes nothing does not swap the DOM", e._fetchAt > 0 && e._sets === before);
  e._openEvent(Object.keys(e._byId)[0]); const popBefore = e._pop && e._pop.html;
  e._fetchAt = 0; e.hass = hass4; await tick(); await tick();
  check("…and leaves an open clipping in place", e._sets === before && e._pop && e._pop.html === popBefore);
  evs.push({ summary: "Dentist", start: { dateTime: "2026-09-15T09:00:00-07:00" }, end: { dateTime: "2026-09-15T10:00:00-07:00" } });
  e._fetchAt = 0; e.hass = hass4; await tick(); await tick();
  check("a refetch with a new event does swap the DOM", e._sets === before + 1 && e.shadowRoot.innerHTML.includes("Dentist"));
}
check("invalid stamps regex throws a config error naming the rule", (() => { try { new Card().setConfig(Object.assign({}, cfg, { stamps: [{ match: "birthday|(", stamp: "star" }] })); return false; } catch (x) { return /homestead-month-card: stamps\[0\] \(stamp "star"\) has an invalid match pattern "birthday\|\("/.test(x.message); } })());
{
  const cleared = []; const realClear = ctx.clearTimeout; ctx.clearTimeout = (t) => { cleared.push(t); return realClear(t); };
  const e = new Card(); e.setConfig(cfg); e.connectedCallback();
  e._popT = setTimeout(() => {}, 60000); e._isoT = setTimeout(() => {}, 60000);
  e.disconnectedCallback(); ctx.clearTimeout = realClear;
  check("disconnectedCallback clears the clipping and isolation timers", cleared.includes(e._popT) && cleared.includes(e._isoT));
}
{
  let resolve; const pending = new Promise((r) => { resolve = r; });
  const e = new Card(); e.setConfig(cfg); e.hass = { states: {}, callApi: () => pending };
  e.setConfig({ calendars: [{ entity: "calendar.other", name: "Other", color: "#123456" }] });
  resolve([{ summary: "Stale event", start: { date: "2026-09-12" }, end: { date: "2026-09-13" } }]); await tick(); await tick();
  check("setConfig mid-fetch: the stale calendar result is discarded", e._events === null && e._fetchAt === 0 && !e.shadowRoot.innerHTML.includes("Stale event"));
  e.hass = { states: {}, callApi: async () => [{ summary: "Fresh event", start: { date: "2026-09-12" }, end: { date: "2026-09-13" } }] }; await tick(); await tick();
  check("…and the next hass fetches afresh for the new config", e._fetchAt > 0 && e.shadowRoot.innerHTML.includes("Fresh event"));
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
