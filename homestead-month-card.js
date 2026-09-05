/* homestead-month-card — The Homestead Times Calendar: a full-screen newsprint month grid
 * for a wall display. Events from any number of HA calendars drawn as highlighter bars
 * (one color per calendar, like the household's paper calendar), day-of-year agates in
 * every cell, computed US holidays, pencil-struck past days, a boxed TODAY, and rubber
 * stamps (cake, rings, bell, ball, plane, cross, star) inked beside birthdays,
 * anniversaries, school closures and the rest. Data-dense by design; read-only. */
const HCM_VERSION = "2026.9.7";
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
      max_events: 7, max_events_portrait: 13, height: "100vh", stamps: [], auto_return: 300, week_start: "monday",
      footer: "Published daily by the household press. Errors are the responsibility of the month.",
    }, config);
    c.calendars = c.calendars.map((x) => ({ entity: x.entity, name: x.name || x.entity.split(".")[1], color: x.color || TAN, stamp: x.stamp || "" }));
    this._cfg = c;
    this._rules = [...(c.stamps || []).map((s) => ({ re: new RegExp(s.match, "i"), stamp: s.stamp })), ...DEFAULT_STAMPS.map((s) => ({ re: new RegExp(s.match, "i"), stamp: s.stamp }))];
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._sig = null; this._events = null; this._spans = null; this._fetchAt = 0; this._fetchKey = ""; this._offset = 0;
    if (this._fontsReady === undefined) {
      const fonts = typeof document !== "undefined" && document.fonts;
      this._fontsReady = !fonts;
      if (fonts) Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 3000))]).then(() => { this._fontsReady = true; this._sig = null; this._render(); });
    }
    this._render();
  }
  set hass(hass) { this._hass = hass; this._maybeFetch(); this._render(); }
  getCardSize() { return 20; }
  connectedCallback() {
    this._tick = setInterval(() => { this._maybeFetch(); this._render(); }, 60000);
    // keyboard month paging for wall displays without a touchscreen
    this._key = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === "n") this._nav(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "p") this._nav(-1);
      else if (e.key === "Home" || e.key === "Escape" || e.key === "t") this._nav(0, true);
    };
    window.addEventListener("keydown", this._key);
    if (typeof matchMedia === "function") { this._mq = matchMedia("(orientation: portrait)"); this._mqf = () => { this._sig = null; this._render(); }; try { this._mq.addEventListener("change", this._mqf); } catch (e) { /* older webview */ } }
  }
  disconnectedCallback() { clearInterval(this._tick); if (this._key) window.removeEventListener("keydown", this._key); if (this._mq && this._mqf) { try { this._mq.removeEventListener("change", this._mqf); } catch (e) { /* older webview */ } } clearTimeout(this._ret); }
  _dispDate() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + this._offset, 1); }
  _nav(delta, home) {
    this._offset = home ? 0 : this._offset + delta;
    clearTimeout(this._ret);
    if (this._offset !== 0 && this._cfg.auto_return > 0) this._ret = setTimeout(() => this._nav(0, true), this._cfg.auto_return * 1000);
    this._sig = null; this._maybeFetch(); this._render();
  }

  _ws() { return this._cfg.week_start === "sunday" ? 0 : 1; }
  _range(disp) {
    const ws = this._ws();
    const first = new Date(disp.getFullYear(), disp.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() - ws + 7) % 7));
    const last = new Date(disp.getFullYear(), disp.getMonth() + 1, 0);
    const end = new Date(last); end.setDate(last.getDate() + (6 - ((last.getDay() - ws + 7) % 7))); end.setHours(23, 59, 59, 0);
    return { start, end };
  }
  async _maybeFetch() {
    if (!this._hass || !this._hass.callApi) return;
    const disp = this._dispDate(), key = `${disp.getFullYear()}-${disp.getMonth()}`;
    if (this._fetching || (Date.now() - this._fetchAt < 15 * 60000 && this._fetchKey === key)) return;
    this._fetching = true;
    try {
      const { start, end } = this._range(disp);
      const map = {}; const spans = [];
      await Promise.all(this._cfg.calendars.map(async (cal) => {
        try {
          const evs = await this._hass.callApi("get", `calendars/${cal.entity}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
          for (const ev of evs || []) {
            const sum = ev.summary || "";
            const stamp = this._stampFor(sum) || cal.stamp || "";
            if (ev.start && ev.start.date) {
              const s = ev.start.date;
              const eDate = new Date(((ev.end && ev.end.date) || s) + "T00:00:00"); eDate.setDate(eDate.getDate() - 1); // end date is exclusive
              const eInc = ymd(eDate) < s ? s : ymd(eDate);
              if (eInc > s) spans.push({ s, e: eInc, sum, color: cal.color, stamp });
              else (map[s] = map[s] || []).push({ t: "", sort: -1, sum, color: cal.color, allDay: true, stamp });
            } else if (ev.start && ev.start.dateTime) {
              const d = new Date(ev.start.dateTime);
              const endRaw = ev.end && ev.end.dateTime ? new Date(new Date(ev.end.dateTime).getTime() - 60000) : d; // a midnight end belongs to the prior day
              const sDay = ymd(d), eDay = ymd(endRaw < d ? d : endRaw);
              if (eDay > sDay) spans.push({ s: sDay, e: eDay, sum, color: cal.color, stamp, t: fmtT(ev.start.dateTime) });
              else (map[sDay] = map[sDay] || []).push({ t: fmtT(ev.start.dateTime), sort: d.getHours() * 60 + d.getMinutes(), sum, color: cal.color, allDay: false, stamp });
            }
          }
        } catch (e) { /* calendar unavailable this pass */ }
      }));
      for (const k of Object.keys(map)) map[k].sort((a, b) => a.sort - b.sort);
      spans.sort((a, b) => (a.s < b.s ? -1 : 1));
      this._events = map; this._spans = spans; this._fetchAt = Date.now(); this._fetchKey = key; this._sig = null; this._render();
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
    const disp = this._dispDate();
    const y = disp.getFullYear(), mo = disp.getMonth();
    const { start } = this._range(disp);
    const hols = c.show_holidays ? this._holidays(y) : {};
    this._uid = this._uid || Math.random().toString(36).slice(2, 7);
    const weeks = [];
    const ws = this._ws();
    const totalCells = (() => { const last = new Date(y, mo + 1, 0); const lead = (new Date(y, mo, 1).getDay() - ws + 7) % 7; return Math.ceil((last.getDate() + lead) / 7) * 7; })();
    const spans = this._spans || [];
    const portrait = this._mq ? this._mq.matches : false;
    const maxEv = portrait ? c.max_events_portrait : c.max_events;
    for (let w = 0; w < totalCells / 7; w++) {
      const wk = [];
      for (let j = 0; j < 7; j++) { const d = new Date(start); d.setDate(start.getDate() + w * 7 + j); wk.push(d); }
      const kk = wk.map(ymd);
      const w0 = kk[0], w6 = kk[6];
      const weekSpans = spans.filter((sp) => sp.s <= w6 && sp.e >= w0);
      const lanes = [];
      const placed = weekSpans.map((sp) => { let li = lanes.findIndex((endY) => endY < sp.s); if (li === -1) { li = lanes.length; lanes.push(sp.e); } else lanes[li] = sp.e; return { sp, li }; });
      const maxLanes = placed.length ? Math.max(...placed.map((p) => p.li)) + 1 : 0;
      // one continuous element per span per week, spanning its grid columns
      const laneBars = placed.map(({ sp, li }) => {
        const a = kk.indexOf(sp.s < w0 ? w0 : sp.s), b = kk.indexOf(sp.e > w6 ? w6 : sp.e);
        return `<div class="lane${sp.s >= w0 ? " lstart" : ""}${sp.e <= w6 ? " lend" : ""}" style="--hl:${esc(sp.color)};grid-column:${a + 1}/${b + 2};grid-row:${2 + li}"><span class="txt">${sp.t ? `<b>${esc(sp.t)}</b> ` : ""}${esc(sp.sum)}</span>${sp.stamp && sp.stamp !== "cake" ? this._stampSvg(sp.stamp) : ""}</div>`;
      }).join("");
      let ovls = "", chs = "", cellevs = "";
      for (let j = 0; j < 7; j++) {
        const d = wk[j], k = kk[j], inMonth = d.getMonth() === mo;
        const isToday = k === today, past = k < today && c.strike_past;
        const hol = hols[`${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`];
        const evs = (this._events && this._events[k]) || [];
        const bday = evs.some((e) => e.stamp === "cake") || placed.some((p) => p.sp.stamp === "cake" && p.sp.s <= k && p.sp.e >= k);
        ovls += `<div class="dovl${isToday ? " today" : ""}" style="--j:${j}">${bday ? `<div class="bigstamp">${this._stampSvg("cake", "big")}</div>` : ""}${past ? '<div class="x"></div>' : ""}${isToday ? '<div class="td">TODAY</div>' : ""}</div>`;
        const fade = `${inMonth ? "" : " out"}${past ? " fade" : ""}`;
        chs += `<div class="ch${fade}" style="grid-column:${j + 1};grid-row:1"><span class="num">${d.getDate()}</span>${hol ? `<span class="hol">${this._stampSvg("star", "hs")}${esc(hol)}</span>` : ""}</div>`;
        const shown = evs.slice(0, maxEv), extra = evs.length - shown.length;
        const bars = shown.map((e) => `<div class="ev${e.allDay ? " ad" : ""}" style="--hl:${esc(e.color)}"><span class="txt">${e.t ? `<b>${esc(e.t)}</b> ` : ""}${esc(e.sum)}</span>${e.stamp && !(bday && e.stamp === "cake") ? this._stampSvg(e.stamp) : ""}</div>`).join("");
        cellevs += `<div class="cellev${fade}" style="grid-column:${j + 1};grid-row:${2 + maxLanes}">${bars}${extra > 0 ? `<div class="more">and ${extra} more, see inside</div>` : ""}</div>`;
      }
      weeks.push(`<div class="week"><div class="ovls">${ovls}</div><div class="wgrid" style="grid-template-rows:auto ${"auto ".repeat(maxLanes)}1fr">${chs}${laneBars}${cellevs}</div></div>`);
    }
    const cells = weeks;
    const legend = c.calendars.map((x) => `<span class="chip" style="--hl:${esc(x.color)}">${esc(x.name)}</span>`).join("");
    const vol = `Vol. ${y - 2020}, No. ${mo + 1}`;
    const body = `
    <svg width="0" height="0" style="position:absolute"><defs><filter id="rub-${this._uid}" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.35" result="a"/>
      <feComposite in="SourceGraphic" in2="a" operator="in"/></filter></defs></svg>
    <div class="mast">
      <div class="mrow1"><span class="mvol">${esc(vol)} · ${esc(c.subtitle)}</span><span class="mname">${esc(c.title)}</span><span class="mleg">${legend}</span></div>
      <div class="mrow2"><span class="rule"></span><span class="month">${MONTHS[mo]} ${y}</span>${this._offset !== 0 ? '<span class="ret">HOME RETURNS TO THE PRESENT</span>' : ""}<span class="rule"></span></div>
    </div>
    <div class="dow">${Array.from({ length: 7 }, (_, i) => `<div>${DOW[(this._ws() + i) % 7]}</div>`).join("")}</div>
    <div class="weeks">${cells.join("")}</div>
    <div class="foot">${esc(c.footer)} · ‹ › keys turn the month; HOME returns.</div>`;
    return { sig: today + "|" + this._offset + "|" + JSON.stringify(this._events ? Object.keys(this._events).length : -1) + "|" + this._fetchAt + "|" + this._fontsReady, html: `<style>${this._css()}</style><div class="page">${body}</div>` };
  }

  _css() {
    const c = this._cfg;
    return `
  :host { display: block; }
  * { box-sizing: border-box; }
  .page { height: ${c.height}; display: flex; flex-direction: column; background: var(--almanac-paper, ${PAPER}); color: ${INK}; font-family: Archivo, 'Segoe UI', sans-serif; padding: 1.1vmin 1.2vw 0.6vmin; overflow: hidden; }
  .mast { border-bottom: 3px double ${INK}; padding-bottom: 0.4vmin; }
  .mrow1 { display: flex; justify-content: space-between; align-items: baseline; gap: 1vw; }
  .mvol { font-size: 1.15vmin; font-weight: 700; letter-spacing: 0.2vw; color: ${TAN}; white-space: nowrap; }
  .mname { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: 3.1vmin; letter-spacing: 0.05vw; white-space: nowrap; }
  .mleg { display: flex; gap: 0.5vw; flex-wrap: wrap; justify-content: flex-end; }
  .chip { font-size: 1.15vmin; font-weight: 700; letter-spacing: 0.08vw; padding: 0.25vmin 0.5vw; background: color-mix(in srgb, var(--hl) 30%, transparent); border-left: 0.25vw solid var(--hl); }
  .mrow2 { display: flex; align-items: center; gap: 1vw; margin-top: 0.3vmin; }
  .mrow2 .rule { flex: 1; border-top: 1px solid ${INK}; }
  .month { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: 2.5vmin; letter-spacing: 0.35vw; }
  .ret { font-size: 1.1vmin; font-weight: 700; letter-spacing: 0.2vw; color: ${TERRA}; border: 1.5px solid ${TERRA}; padding: 0.2vmin 0.5vw; transform: rotate(-2deg); white-space: nowrap; }
  .dow { display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1.5px solid ${INK}; }
  .dow div { text-align: center; font-size: 1.25vmin; font-weight: 700; letter-spacing: 0.3vw; color: ${BROWN}; padding: 0.5vmin 0 0.4vmin; }
  .weeks { flex: 1; display: flex; flex-direction: column; min-height: 0; border-left: 1px solid ${DOT}; border-right: 1px solid ${DOT}; }
  .week { flex: 1; position: relative; min-height: 0; border-bottom: 1px solid ${DOT}; }
  .ovls { position: absolute; inset: 0; }
  .dovl { position: absolute; top: 0; bottom: 0; left: calc(var(--j) * 100% / 7); width: calc(100% / 7); pointer-events: none; }
  .dovl.today { background: #efe0c6; box-shadow: inset 0 0 0 3px ${INK}; }
  .wgrid { position: relative; height: 100%; display: grid; grid-template-columns: repeat(7, 1fr); min-height: 0; overflow: hidden;
    background-image: repeating-linear-gradient(to right, transparent 0, transparent calc(100% / 7 - 1px), ${DOT} calc(100% / 7 - 1px), ${DOT} calc(100% / 7)); }
  .out { opacity: .45; }
  .fade { opacity: .62; }
  .lane { margin: 0.14vmin 0; padding: 0.12vmin 0.3vw; display: flex; align-items: center; gap: 0.25vw; font-size: 1.45vmin; line-height: 1.25; font-weight: 700; letter-spacing: 0.04vw; background: color-mix(in srgb, var(--hl) 28%, transparent); min-width: 0; overflow: hidden; }
  .lane.lstart { margin-left: 0.35vw; border-left: 0.22vw solid var(--hl); }
  .lane.lend { margin-right: 0.35vw; }
  .lane .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .cellev { padding: 0.3vmin 0.35vw 0.4vmin; display: flex; flex-direction: column; gap: 0.28vmin; overflow: hidden; min-width: 0; min-height: 0; }
  .ch { display: flex; align-items: baseline; gap: 0.4vw; padding: 0.4vmin 0.35vw 0; min-width: 0; }
  .num { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: 2.2vmin; line-height: 1; }
  .hol { font-family: Fraunces, Georgia, serif; font-style: italic; font-size: 1.25vmin; color: ${BROWN}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-flex; align-items: center; gap: 0.2vw; min-width: 0; }
  .ev { display: flex; align-items: center; gap: 0.25vw; font-size: 1.45vmin; line-height: 1.25; padding: 0.12vmin 0.3vw; background: color-mix(in srgb, var(--hl) 28%, transparent); border-left: 0.22vw solid var(--hl); min-height: 0; }
  .ev.ad { font-weight: 700; letter-spacing: 0.04vw; }
  .ev .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
  .ev b { font-weight: 700; color: #241c12; }
  .more { font-size: 1.05vmin; color: ${TAN}; font-style: italic; }
  .stamp { width: 2.1vmin; height: 2.1vmin; flex: none; stroke: ${STAMP}; color: ${STAMP}; transform: rotate(-8deg); opacity: .9; }
  .stamp.hs { width: 1.7vmin; height: 1.7vmin; transform: rotate(6deg); }
  .stamp circle, .stamp path { stroke: ${STAMP}; }
  .bigstamp { position: absolute; right: 0.4vw; bottom: 0.5vmin; width: 52%; max-width: 11vmin; aspect-ratio: 1; opacity: .4; pointer-events: none; }
  .bigstamp .stamp { width: 100%; height: 100%; transform: rotate(-11deg); }
  .dovl .x { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to top right, transparent 47.5%, ${GRAPHITE} 47.5%, ${GRAPHITE} 49.2%, transparent 49.2%), linear-gradient(to top left, transparent 47.5%, ${GRAPHITE}55 47.5%, ${GRAPHITE}55 49.2%, transparent 49.2%); opacity: .5; }
  .td { position: absolute; right: 0.3vw; bottom: 0.3vmin; font-size: 1vmin; font-weight: 700; letter-spacing: 0.25vw; color: ${TERRA}; border: 1.5px solid ${TERRA}; padding: 0.1vmin 0.35vw; transform: rotate(-3deg); opacity: .85; }
  .foot { text-align: center; font-size: 1.1vmin; color: ${TAN}; letter-spacing: 0.08vw; padding: 0.5vmin 0 0.3vmin; }`;
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
