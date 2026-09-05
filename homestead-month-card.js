/* homestead-month-card — The Homestead Times Calendar: a full-screen newsprint month grid
 * for a wall display. Events from any number of HA calendars drawn as highlighter bars
 * (one color per calendar, like the household's paper calendar), day-of-year agates in
 * every cell, computed US holidays, pencil-struck past days, a boxed TODAY, and rubber
 * stamps (cake, rings, bell, ball, plane, cross, star) inked beside birthdays,
 * anniversaries, school closures and the rest. Data-dense by design; read-only. */
const HCM_VERSION = "2026.9.1";
const INK = "#3a2d1f", PAPER = "#f3e7d3", TAN = "#a3876a", BROWN = "#7a6248",
  TERRA = "#c65f38", DOT = "#cfb894", GRAPHITE = "#55504a", STAMP = "#b03a26";
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const DOW = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const doy = (d) => { const s = new Date(d.getFullYear(), 0, 0); return Math.round((d - s) / 86400000); };
const fmtT = (dt) => { const d = new Date(dt); let h = d.getHours(); const m = d.getMinutes(), ap = h >= 12 ? "p" : "a"; h = h % 12 || 12; return h + (m ? ":" + pad2(m) : "") + ap; };
const nth = (y, mo, dow, n) => { const first = new Date(y, mo, 1); let d = 1 + ((dow - first.getDay() + 7) % 7) + (n - 1) * 7; return `${pad2(mo + 1)}-${pad2(d)}`; };
const lastDow = (y, mo, dow) => { const last = new Date(y, mo + 1, 0); const d = last.getDate() - ((last.getDay() - dow + 7) % 7); return `${pad2(mo + 1)}-${pad2(d)}`; };

const DEFAULT_STAMPS = [
  { match: "birthday|b-?day", stamp: "cake" },
  { match: "anniversar", stamp: "rings" },
  { match: "no school|school closed|fall break|spring break|winter break|early release", stamp: "bell" },
  { match: "soccer|game|match|fan fest|practice", stamp: "ball" },
  { match: "trip|vacation|travel|flight|midway|camp", stamp: "plane" },
  { match: "\\bdr\\b|doctor|dentist|ortho|appt|appointment|checkup", stamp: "cross" },
];
const STAMP_GLYPHS = {
  cake: '<path d="M10 18 h12 v7 h-12 z M10 21 c2 2 4 -2 6 0 c2 2 4 -2 6 0 M13 18 v-3 M19 18 v-3 M13 12 v2 M19 12 v2" fill="none"/>',
  rings: '<circle cx="13" cy="17" r="5" fill="none"/><circle cx="19" cy="17" r="5" fill="none"/>',
  bell: '<path d="M16 9 c-4 0 -5 4 -5 7 l-2 4 h14 l-2 -4 c0 -3 -1 -7 -5 -7 z M14 21 a2 2 0 0 0 4 0 M9 8 L23 24" fill="none"/>',
  ball: '<circle cx="16" cy="16" r="7" fill="none"/><path d="M16 12 l3.5 2.6 l-1.3 4.2 h-4.4 l-1.3 -4.2 z M16 9 v3 M9.5 14 l3 1 M22.5 14 l-3 1 M12 22 l2 -2.5 M20 22 l-2 -2.5" fill="none"/>',
  plane: '<path d="M8 19 l16 -7 l-6 8 l-2 -2 l-3 4 l-0.5 -3.5 z" fill="none"/>',
  cross: '<circle cx="16" cy="16" r="7.5" fill="none"/><path d="M16 11.5 v9 M11.5 16 h9" fill="none"/>',
  star: '<path d="M16 9 l2.1 4.6 5 .5 -3.8 3.4 1.1 5 -4.4 -2.6 -4.4 2.6 1.1 -5 -3.8 -3.4 5 -.5 z" fill="none"/>',
};

class HomesteadMonthCard extends HTMLElement {
  static getStubConfig() { return { calendars: [{ entity: "calendar.family", name: "Family", color: "#5f7e94" }] }; }

  setConfig(config) {
    if (!config || !Array.isArray(config.calendars) || !config.calendars.length) throw new Error("homestead-month-card: set calendars: [{entity, name, color}]");
    const c = Object.assign({
      title: "The Homestead Times", subtitle: "CALENDAR & ALMANACK FOR THE HOUSEHOLD", show_holidays: true, strike_past: true,
      max_events: 7, height: "100vh", stamps: [],
      footer: "Published daily by the household press. Errors are the responsibility of the month.",
    }, config);
    c.calendars = c.calendars.map((x) => ({ entity: x.entity, name: x.name || x.entity.split(".")[1], color: x.color || TAN, stamp: x.stamp || "" }));
    this._cfg = c;
    this._rules = [...(c.stamps || []).map((s) => ({ re: new RegExp(s.match, "i"), stamp: s.stamp })), ...DEFAULT_STAMPS.map((s) => ({ re: new RegExp(s.match, "i"), stamp: s.stamp }))];
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._sig = null; this._events = null; this._fetchAt = 0; this._fetchKey = "";
    if (this._fontsReady === undefined) {
      const fonts = typeof document !== "undefined" && document.fonts;
      this._fontsReady = !fonts;
      if (fonts) Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 3000))]).then(() => { this._fontsReady = true; this._sig = null; this._render(); });
    }
    this._render();
  }
  set hass(hass) { this._hass = hass; this._maybeFetch(); this._render(); }
  getCardSize() { return 20; }
  connectedCallback() { this._tick = setInterval(() => { this._maybeFetch(); this._render(); }, 60000); }
  disconnectedCallback() { clearInterval(this._tick); }

  _range(now) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const end = new Date(last); end.setDate(last.getDate() + (6 - last.getDay())); end.setHours(23, 59, 59, 0);
    return { start, end };
  }
  async _maybeFetch() {
    if (!this._hass || !this._hass.callApi) return;
    const now = new Date(), key = `${now.getFullYear()}-${now.getMonth()}`;
    if (this._fetching || (Date.now() - this._fetchAt < 15 * 60000 && this._fetchKey === key)) return;
    this._fetching = true;
    try {
      const { start, end } = this._range(now);
      const map = {};
      await Promise.all(this._cfg.calendars.map(async (cal) => {
        try {
          const evs = await this._hass.callApi("get", `calendars/${cal.entity}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
          for (const ev of evs || []) {
            const sum = ev.summary || "";
            const stamp = this._stampFor(sum) || cal.stamp || "";
            if (ev.start && ev.start.date) {
              const s = new Date(ev.start.date + "T00:00:00"), e = new Date((ev.end && ev.end.date ? ev.end.date : ev.start.date) + "T00:00:00");
              for (let d = new Date(s); d < e || +d === +s; d.setDate(d.getDate() + 1)) { (map[ymd(d)] = map[ymd(d)] || []).push({ t: "", sort: -1, sum, color: cal.color, allDay: true, stamp }); if (+d === +s && !(d < e)) break; }
            } else if (ev.start && ev.start.dateTime) {
              const d = new Date(ev.start.dateTime);
              (map[ymd(d)] = map[ymd(d)] || []).push({ t: fmtT(ev.start.dateTime), sort: d.getHours() * 60 + d.getMinutes(), sum, color: cal.color, allDay: false, stamp });
            }
          }
        } catch (e) { /* calendar unavailable this pass */ }
      }));
      for (const k of Object.keys(map)) map[k].sort((a, b) => a.sort - b.sort);
      this._events = map; this._fetchAt = Date.now(); this._fetchKey = key; this._sig = null; this._render();
    } finally { this._fetching = false; }
  }
  _stampFor(sum) { for (const r of this._rules) if (r.re.test(sum)) return r.stamp; return ""; }
  _holidays(y) {
    const h = {
      "01-01": "New Year's Day", "02-14": "Valentine's Day", "06-19": "Juneteenth", "07-04": "Independence Day",
      "10-31": "Halloween", "11-11": "Veterans Day", "12-24": "Christmas Eve", "12-25": "Christmas", "12-31": "New Year's Eve",
    };
    h[nth(y, 0, 1, 3)] = "M. L. King Jr. Day"; h[nth(y, 1, 1, 3)] = "Presidents' Day"; h[nth(y, 4, 0, 2)] = "Mother's Day";
    h[lastDow(y, 4, 1)] = "Memorial Day"; h[nth(y, 5, 0, 3)] = "Father's Day"; h[nth(y, 8, 1, 1)] = "Labor Day";
    h[nth(y, 9, 1, 2)] = "Columbus Day"; h[nth(y, 10, 4, 4)] = "Thanksgiving";
    return h;
  }

  _render() {
    if (!this._cfg || !this._hass) return;
    let out;
    try { out = this._page(); }
    catch (e) { out = { sig: "err:" + e.message, html: `<div style="padding:12px;color:#b00;font-family:sans-serif">${esc(e.message)}</div>` }; }
    if (out.sig === this._sig) return;
    this._sig = out.sig;
    this.shadowRoot.innerHTML = out.html;
  }

  _stampSvg(name, extra) {
    if (!STAMP_GLYPHS[name]) return "";
    return `<svg class="stamp${extra ? " " + extra : ""}" viewBox="0 0 32 32" aria-hidden="true"><g filter="url(#rub-${this._uid})"><circle cx="16" cy="16" r="14" fill="none" stroke-width="2.2"/><circle cx="16" cy="16" r="11.4" fill="none" stroke-width="0.9" opacity=".75"/>${STAMP_GLYPHS[name].replace(/fill="none"/g, 'fill="none" stroke-width="1.7"')}</g></svg>`;
  }

  _page() {
    const c = this._cfg, now = new Date(), today = ymd(now);
    const y = now.getFullYear(), mo = now.getMonth();
    const { start } = this._range(now);
    const daysInYear = leap(y) ? 366 : 365;
    const hols = c.show_holidays ? this._holidays(y) : {};
    this._uid = this._uid || Math.random().toString(36).slice(2, 7);
    const cells = [];
    const totalCells = (() => { const last = new Date(y, mo + 1, 0); return Math.ceil((last.getDate() + new Date(y, mo, 1).getDay()) / 7) * 7; })();
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = ymd(d), inMonth = d.getMonth() === mo;
      const isToday = k === today, past = k < today;
      const dn = doy(d);
      const hol = hols[`${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`];
      const evs = (this._events && this._events[k]) || [];
      const shown = evs.slice(0, c.max_events), extra = evs.length - shown.length;
      const bars = shown.map((e) => `<div class="ev${e.allDay ? " ad" : ""}" style="--hl:${esc(e.color)}"><span class="txt">${e.t ? `<b>${esc(e.t)}</b> ` : ""}${esc(e.sum)}</span>${e.stamp ? this._stampSvg(e.stamp) : ""}</div>`).join("");
      cells.push(`<div class="cell${inMonth ? "" : " out"}${isToday ? " today" : ""}${past && c.strike_past ? " past" : ""}">
        <div class="ch"><span class="num">${d.getDate()}</span>${hol ? `<span class="hol">${this._stampSvg("star", "hs")}${esc(hol)}</span>` : ""}<span class="agate">${dn}/${daysInYear - dn}</span></div>
        <div class="evs">${bars}${extra > 0 ? `<div class="more">and ${extra} more, see inside</div>` : ""}</div>
        ${past && c.strike_past ? '<div class="x"></div>' : ""}${isToday ? '<div class="td">TODAY</div>' : ""}
      </div>`);
    }
    const legend = c.calendars.map((x) => `<span class="chip" style="--hl:${esc(x.color)}">${esc(x.name)}</span>`).join("");
    const vol = `Vol. ${y - 2020}, No. ${mo + 1}`;
    const body = `
    <svg width="0" height="0" style="position:absolute"><defs><filter id="rub-${this._uid}" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.35" result="a"/>
      <feComposite in="SourceGraphic" in2="a" operator="in"/></filter></defs></svg>
    <div class="mast">
      <div class="mrow1"><span class="mvol">${esc(vol)} · ${esc(c.subtitle)}</span><span class="mname">${esc(c.title)}</span><span class="mleg">${legend}</span></div>
      <div class="mrow2"><span class="rule"></span><span class="month">${MONTHS[mo]} ${y}</span><span class="rule"></span></div>
    </div>
    <div class="dow">${DOW.map((d) => `<div>${d}</div>`).join("")}</div>
    <div class="grid" style="--rows:${totalCells / 7}">${cells.join("")}</div>
    <div class="foot">${esc(c.footer)}</div>`;
    return { sig: today + "|" + JSON.stringify(this._events ? Object.keys(this._events).length : -1) + "|" + this._fetchAt + "|" + this._fontsReady, html: `<style>${this._css()}</style><div class="page">${body}</div>` };
  }

  _css() {
    const c = this._cfg;
    return `
  :host { display: block; }
  * { box-sizing: border-box; }
  .page { height: ${c.height}; display: flex; flex-direction: column; background: var(--almanac-paper, ${PAPER}); color: ${INK}; font-family: Archivo, 'Segoe UI', sans-serif; padding: 1.1vh 1.2vw 0.6vh; overflow: hidden; }
  .mast { border-bottom: 3px double ${INK}; padding-bottom: 0.4vh; }
  .mrow1 { display: flex; justify-content: space-between; align-items: baseline; gap: 1vw; }
  .mvol { font-size: 1.15vh; font-weight: 700; letter-spacing: 0.2vw; color: ${TAN}; white-space: nowrap; }
  .mname { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: 3.1vh; letter-spacing: 0.05vw; white-space: nowrap; }
  .mleg { display: flex; gap: 0.5vw; flex-wrap: wrap; justify-content: flex-end; }
  .chip { font-size: 1.15vh; font-weight: 700; letter-spacing: 0.08vw; padding: 0.25vh 0.5vw; background: color-mix(in srgb, var(--hl) 30%, transparent); border-left: 0.25vw solid var(--hl); }
  .mrow2 { display: flex; align-items: center; gap: 1vw; margin-top: 0.3vh; }
  .mrow2 .rule { flex: 1; border-top: 1px solid ${INK}; }
  .month { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: 2.5vh; letter-spacing: 0.35vw; }
  .dow { display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1.5px solid ${INK}; }
  .dow div { text-align: center; font-size: 1.25vh; font-weight: 700; letter-spacing: 0.3vw; color: ${BROWN}; padding: 0.5vh 0 0.4vh; }
  .grid { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(var(--rows), 1fr); border-left: 1px solid ${DOT}; min-height: 0; }
  .cell { position: relative; border-right: 1px solid ${DOT}; border-bottom: 1px solid ${DOT}; padding: 0.4vh 0.35vw; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
  .cell.out { opacity: .45; }
  .cell.today { box-shadow: inset 0 0 0 3px ${INK}; background: #efe0c6; }
  .ch { display: flex; align-items: baseline; gap: 0.4vw; }
  .num { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: 2.2vh; line-height: 1; }
  .agate { margin-left: auto; font-size: 1vh; color: ${TAN}; letter-spacing: 0.05vw; }
  .hol { font-family: Fraunces, Georgia, serif; font-style: italic; font-size: 1.25vh; color: ${BROWN}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-flex; align-items: center; gap: 0.2vw; min-width: 0; }
  .evs { margin-top: 0.4vh; display: flex; flex-direction: column; gap: 0.28vh; min-height: 0; overflow: hidden; }
  .ev { display: flex; align-items: center; gap: 0.25vw; font-size: 1.45vh; line-height: 1.25; padding: 0.12vh 0.3vw; background: color-mix(in srgb, var(--hl) 28%, transparent); border-left: 0.22vw solid var(--hl); min-height: 0; }
  .ev.ad { font-weight: 700; letter-spacing: 0.04vw; }
  .ev .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
  .ev b { font-weight: 700; color: #241c12; }
  .more { font-size: 1.05vh; color: ${TAN}; font-style: italic; }
  .stamp { width: 2.1vh; height: 2.1vh; flex: none; stroke: ${STAMP}; color: ${STAMP}; transform: rotate(-8deg); opacity: .9; }
  .stamp.hs { width: 1.7vh; height: 1.7vh; transform: rotate(6deg); }
  .stamp circle, .stamp path { stroke: ${STAMP}; }
  .cell .x { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to top right, transparent 47.5%, ${GRAPHITE} 47.5%, ${GRAPHITE} 49.2%, transparent 49.2%), linear-gradient(to top left, transparent 47.5%, ${GRAPHITE}55 47.5%, ${GRAPHITE}55 49.2%, transparent 49.2%); opacity: .5; }
  .cell.past .evs, .cell.past .ch { opacity: .62; }
  .td { position: absolute; right: 0.3vw; bottom: 0.3vh; font-size: 1vh; font-weight: 700; letter-spacing: 0.25vw; color: ${TERRA}; border: 1.5px solid ${TERRA}; padding: 0.1vh 0.35vw; transform: rotate(-3deg); opacity: .85; }
  .foot { text-align: center; font-size: 1.1vh; color: ${TAN}; letter-spacing: 0.08vw; padding: 0.5vh 0 0.3vh; }`;
  }
}

if (!document.getElementById("hcm-font")) {
  const l = document.createElement("link");
  l.id = "hcm-font"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;0,9..144,900;1,9..144,400&family=Archivo:wght@400;600;700&display=swap";
  document.head.appendChild(l);
}
customElements.define("homestead-month-card", HomesteadMonthCard);
console.info(`%c HOMESTEAD-MONTH-CARD %c ${HCM_VERSION} `, "background:#3a2d1f;color:#f3e7d3;font-weight:700", "background:#b03a26;color:#fff;font-weight:700");
window.customCards = window.customCards || [];
window.customCards.push({ type: "homestead-month-card", name: "Homestead Month Card", description: "A full-screen newsprint month calendar for wall displays: highlighter bars per calendar, day-of-year agates, holidays, struck past days and rubber-stamp icons.", preview: true, documentationURL: "https://github.com/LoneWolf345/homestead-month-card" });
