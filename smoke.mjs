// smoke.mjs — node harness for homestead-month-card
import fs from "node:fs"; import vm from "node:vm";
const src = fs.readFileSync(new URL("./homestead-month-card.js", import.meta.url), "utf8");
class HTMLElement { constructor() { this._sr = null; this.style = {}; } attachShadow() { this._sr = { innerHTML: "" }; return this._sr; } get shadowRoot() { return this._sr; } dispatchEvent() {} }
const defs = {};
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FakeDate._now); } static now() { return FakeDate._now; } }
FakeDate._now = new Date(2026, 8, 5, 12, 0, 0).getTime(); // Sat Sep 5 2026
const ctx = { HTMLElement, customElements: { define: (n, c) => (defs[n] = c) }, document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }, console, setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout, Date: FakeDate, Math, encodeURIComponent };
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
check("nav +1: OCTOBER 2026 + return badge, no today cell", h2.includes("OCTOBER 2026") && h2.includes("HOME RETURNS TO THE PRESENT") && !/class="dovl today"/.test(h2));
check("nav +1: no agates in October either", !/\d+\/\d+</.test(h2.split('class="grid"')[1] || ""));
check("nav +1: Halloween printed", h2.includes("Halloween"));
el._nav(0, true); await tick(); await tick();
const h3 = el.shadowRoot.innerHTML;
check("HOME returns: September + today box back, badge gone", h3.includes("SEPTEMBER 2026") && /class="dovl today"/.test(h3) && !h3.includes("HOME RETURNS"));
check("footer carries the key hint", h3.includes("keys turn the month; HOME returns."));
check("big cake stamp on the birthday cell", (h3.match(/class="bigstamp"/g) || []).length === 1 && h3.includes('class="stamp big"'));
check("inline cake suppressed when big cake present", !/Sarah&#39;s Birthday<\/span><svg class="stamp"/.test(h3));
check("sizes in vmin, page height stays 100vh", h3.includes("2.2vmin") && h3.includes("height: 100vh"));
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
