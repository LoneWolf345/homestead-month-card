/* homestead-month-card — The Homestead Times Calendar: a full-screen newsprint month grid
 * for a wall display. Events from any number of HA calendars drawn as highlighter bars
 * (one color per calendar, like the household's paper calendar), computed US holidays,
 * pencil-struck past days, a boxed TODAY, and rubber stamps (cake, rings, bell, ball,
 * plane, cross, star, suitcase) inked beside birthdays, anniversaries, school closures
 * and the rest. Data-dense by design; tap an event for its clipping. */
const HCM_VERSION = "2026.9.19";
const INK = "#3a2d1f", PAPER = "#f3e7d3", TAN = "#a3876a", BROWN = "#7a6248",
  TERRA = "#c65f38", DOT = "#cfb894", GRAPHITE = "#55504a", STAMP = "#b03a26";
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const DOW = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// everything the grid prints from a fetch, as one string: the render signature compares this rather
// than the fetch timestamp, so a refresh that changes nothing leaves the DOM (and an open clipping) alone
const evKey = (map, spans) => JSON.stringify([
  Object.keys(map).sort().map((k) => [k, map[k].map((e) => [e.id, e.t, e.sum, e.color, e.stamp, e.allDay])]),
  spans.map((sp) => [sp.id, sp.s, sp.e, sp.t || "", sp.sum, sp.color, sp.stamp]),
]);
const fmtT = (dt) => { const d = new Date(dt); let h = d.getHours(); const m = d.getMinutes(), ap = h >= 12 ? "p" : "a"; h = h % 12 || 12; return h + (m ? ":" + pad2(m) : "") + ap; };
const nth = (y, mo, dow, n) => { const first = new Date(y, mo, 1); let d = 1 + ((dow - first.getDay() + 7) % 7) + (n - 1) * 7; return `${pad2(mo + 1)}-${pad2(d)}`; };
const lastDow = (y, mo, dow) => { const last = new Date(y, mo + 1, 0); const d = last.getDate() - ((last.getDay() - dow + 7) % 7); return `${pad2(mo + 1)}-${pad2(d)}`; };

const DEFAULT_STAMPS = [
  { match: "birthday|b-?day", stamp: "cake" },
  { match: "anniversar", stamp: "rings" },
  { match: "no school|school closed|fall break|spring break|winter break|early release", stamp: "bell" },
  { match: "soccer|game|match|fan fest|practice", stamp: "ball" },
  { match: "trip|vacation|travel|flight|midway|camp|arriv|depart|land(s|ing)?\\b|takes? off|airport", stamp: "plane" },
  { match: "\\bdr\\b|doctor|dentist|ortho|appt|appointment|checkup", stamp: "cross" },
  { match: "visitor|guests?\\b|staying with|in town", stamp: "suitcase" },
];
const STAMP_GLYPHS = {
  cake: '<path d="M10 18 h12 v7 h-12 z M10 21 c2 2 4 -2 6 0 c2 2 4 -2 6 0 M13 18 v-3 M19 18 v-3 M13 12 v2 M19 12 v2" fill="none"/>',
  rings: '<circle cx="13" cy="17" r="5" fill="none"/><circle cx="19" cy="17" r="5" fill="none"/>',
  bell: '<path d="M16 9 c-4 0 -5 4 -5 7 l-2 4 h14 l-2 -4 c0 -3 -1 -7 -5 -7 z M14 21 a2 2 0 0 0 4 0 M9 8 L23 24" fill="none"/>',
  ball: '<circle cx="16" cy="16" r="7" fill="none"/><path d="M16 12 l3.5 2.6 l-1.3 4.2 h-4.4 l-1.3 -4.2 z M16 9 v3 M9.5 14 l3 1 M22.5 14 l-3 1 M12 22 l2 -2.5 M20 22 l-2 -2.5" fill="none"/>',
  plane: '<path d="M8 19 l16 -7 l-6 8 l-2 -2 l-3 4 l-0.5 -3.5 z" fill="none"/>',
  cross: '<circle cx="16" cy="16" r="7.5" fill="none"/><path d="M16 11.5 v9 M11.5 16 h9" fill="none"/>',
  star: '<path d="M16 9 l2.1 4.6 5 .5 -3.8 3.4 1.1 5 -4.4 -2.6 -4.4 2.6 1.1 -5 -3.8 -3.4 5 -.5 z" fill="none"/>',
  suitcase: '<rect x="9" y="13" width="14" height="10" rx="1.5" fill="none"/><path d="M13 13 v-3 h6 v3 M9 17 h14 M12.5 17 v6 M19.5 17 v6" fill="none"/>',
};

class HomesteadMonthCard extends HTMLElement {
  static getStubConfig() { return { calendars: [{ entity: "calendar.family", name: "Family", color: "#5f7e94" }] }; }

  setConfig(config) {
    if (!config || !Array.isArray(config.calendars) || !config.calendars.length) throw new Error("homestead-month-card: set calendars: [{entity, name, color}]");
    const c = Object.assign({
      title: "The Homestead Times", subtitle: "CALENDAR & ALMANACK FOR THE HOUSEHOLD", show_holidays: true, strike_past: true,
      max_events: 7, max_events_portrait: 13, height: "100vh", stamps: [], auto_return: 300, week_start: "monday",
      tap: true, popup_seconds: 20, isolate_seconds: 6, navigation: true,
      // a running-head button that leaves the wall for the paper's front page ("" hides it)
      paper_path: "/the-almanac/front", paper_label: "THE PAPER",
      // a to-do list entity that remembers hidden events (one item per event id), shared by every screen; "" disables hiding
      hidden_list: "",
      footer: "Published daily by the household press. Errors are the responsibility of the month.",
    }, config);
    c.calendars = c.calendars.map((x) => ({ entity: x.entity, name: x.name || x.entity.split(".")[1], color: x.color || TAN, stamp: x.stamp || "" }));
    this._cfg = c;
    // a user's typo in a stamp rule must surface as a config error that names the rule, not a raw SyntaxError
    const compile = (s, i) => { try { return new RegExp(s.match, "i"); } catch (e) { throw new Error(`homestead-month-card: stamps[${i}] (stamp "${s.stamp}") has an invalid match pattern ${JSON.stringify(s.match)}: ${e.message}`); } };
    this._rules = [...(c.stamps || []).map((s, i) => ({ re: compile(s, i), stamp: s.stamp })), ...DEFAULT_STAMPS.map((s) => ({ re: new RegExp(s.match, "i"), stamp: s.stamp }))];
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._sig = null; this._events = null; this._spans = null; this._fetchAt = 0; this._fetchKey = ""; this._evKey = ""; this._offset = 0;
    this._hidden = new Set(); this._hiddenRecs = []; this._confirmDel = null;
    // a new config retires any fetch still in flight: its result is checked against this number after the await
    this._fetchSeq = (this._fetchSeq || 0) + 1; this._fetching = false;
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
    // keyboard month paging for wall boxes with a keyboard: arrows / PgUp PgDn / p n turn the month,
    // Shift+arrows turn a year, Home / t / Esc return to the present (Esc closes a clipping first)
    this._key = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape" && this._pop) { this._closePop(); return; }
      const step = e.shiftKey ? 12 : 1;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === "n" || e.key === "N" || e.key === ".") this._nav(step);
      else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "p" || e.key === "P" || e.key === ",") this._nav(-step);
      else if (e.key === "Home" || e.key === "Escape" || e.key === "t" || e.key === "T") this._nav(0, true);
    };
    window.addEventListener("keydown", this._key);
    if (!this._tapBound && this.shadowRoot) {
      this._tapBound = true;
      this.shadowRoot.addEventListener("click", (e) => this._onTap(e));
      // a swipe across the grid turns the month on the wall tablet, where there is no keyboard
      this.shadowRoot.addEventListener("touchstart", (e) => this._swipeStart(e), { passive: true });
      this.shadowRoot.addEventListener("touchend", (e) => this._swipeEnd(e), { passive: true });
    }
    if (typeof matchMedia === "function") { this._mq = matchMedia("(orientation: portrait)"); this._mqf = () => { this._sig = null; this._render(); }; try { this._mq.addEventListener("change", this._mqf); } catch (e) { /* older webview */ } }
  }
  disconnectedCallback() { clearInterval(this._tick); if (this._key) window.removeEventListener("keydown", this._key); if (this._mq && this._mqf) { try { this._mq.removeEventListener("change", this._mqf); } catch (e) { /* older webview */ } } clearTimeout(this._ret); clearTimeout(this._popT); clearTimeout(this._isoT); clearTimeout(this._delT); }
  _dispDate() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + this._offset, 1); }
  _nav(delta, home) {
    this._offset = home ? 0 : this._offset + delta;
    clearTimeout(this._ret);
    if (this._offset !== 0 && this._cfg.auto_return > 0) this._ret = setTimeout(() => this._nav(0, true), this._cfg.auto_return * 1000);
    if (this._pop) { this._pop = null; clearTimeout(this._popT); }
    this._sig = null; this._maybeFetch(); this._render();
  }
  // a horizontal swipe (mostly sideways, at least 60px) turns the month: left = forward, right = back
  _swipeStart(e) { const t = e.touches && e.touches[0]; this._sw = t ? { x: t.clientX, y: t.clientY, at: Date.now() } : null; }
  _swipeEnd(e) {
    const s = this._sw; this._sw = null;
    const t = e.changedTouches && e.changedTouches[0];
    if (!s || !t || !this._cfg.navigation) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - s.at > 1200) return;
    this._nav(dx < 0 ? 1 : -1);
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
    const seq = this._fetchSeq;
    try {
      const { start, end } = this._range(disp);
      const map = {}; const spans = []; const byId = {}; const hiddenRecs = [];
      // the hidden set first: one to-do item per event id, kept in Home Assistant so every screen agrees
      let hidden = this._hidden || new Set();
      if (this._cfg.hidden_list && this._hass.callWS) {
        try { const r = await this._hass.callWS({ type: "todo/item/list", entity_id: this._cfg.hidden_list }); hidden = new Set(((r && r.items) || []).map((i) => i.summary)); }
        catch (e) { /* keep the last known set */ }
      }
      await Promise.all(this._cfg.calendars.map(async (cal) => {
        try {
          const evs = await this._hass.callApi("get", `calendars/${cal.entity}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
          let n = 0;
          for (const ev of evs || []) {
            const sum = ev.summary || "";
            const stamp = this._stampFor(sum) || cal.stamp || "";
            // one id per instance: a recurring series shares a uid, so the recurrence id tells its days apart
            const id = `${cal.entity}|${ev.uid || n}${ev.recurrence_id ? "|" + ev.recurrence_id : ""}`; n++;
            // the full record, for the clipping that opens on tap
            const rec = { id, cal: cal.entity, calName: cal.name, color: cal.color, stamp, sum, desc: ev.description || "", loc: ev.location || "", start: ev.start, end: ev.end, allDay: !!(ev.start && ev.start.date), s: "", e: "", t: "", uid: ev.uid || "", rid: ev.recurrence_id || "", hidden: hidden.has(id) };
            let item = null, span = null;
            if (ev.start && ev.start.date) {
              const s = ev.start.date;
              const eDate = new Date(((ev.end && ev.end.date) || s) + "T00:00:00"); eDate.setDate(eDate.getDate() - 1); // end date is exclusive
              const eInc = ymd(eDate) < s ? s : ymd(eDate);
              rec.s = s; rec.e = eInc;
              if (eInc > s) span = { s, e: eInc, sum, color: cal.color, stamp, id, cal: cal.entity };
              else item = { day: s, ev: { t: "", sort: -1, sum, color: cal.color, allDay: true, stamp, id, cal: cal.entity } };
            } else if (ev.start && ev.start.dateTime) {
              const d = new Date(ev.start.dateTime);
              const endRaw = ev.end && ev.end.dateTime ? new Date(new Date(ev.end.dateTime).getTime() - 60000) : d; // a midnight end belongs to the prior day
              const sDay = ymd(d), eDay = ymd(endRaw < d ? d : endRaw);
              rec.s = sDay; rec.e = eDay; rec.t = fmtT(ev.start.dateTime);
              if (eDay > sDay) span = { s: sDay, e: eDay, sum, color: cal.color, stamp, t: fmtT(ev.start.dateTime), id, cal: cal.entity };
              else item = { day: sDay, ev: { t: fmtT(ev.start.dateTime), sort: d.getHours() * 60 + d.getMinutes(), sum, color: cal.color, allDay: false, stamp, id, cal: cal.entity } };
            } else continue;
            byId[id] = rec;
            // a hidden event keeps its record (the day clipping lists it struck through) but leaves the grid
            if (rec.hidden) { hiddenRecs.push(rec); continue; }
            if (span) spans.push(span); else (map[item.day] = map[item.day] || []).push(item.ev);
          }
        } catch (e) { /* calendar unavailable this pass */ }
      }));
      if (seq !== this._fetchSeq) return;
      for (const k of Object.keys(map)) map[k].sort((a, b) => a.sort - b.sort);
      spans.sort((a, b) => (a.s < b.s ? -1 : 1));
      this._events = map; this._spans = spans; this._byId = byId; this._hidden = hidden; this._hiddenRecs = hiddenRecs; this._fetchAt = Date.now(); this._fetchKey = key;
      // no _sig reset here: the signature carries the event key, so an unchanged month is left as it stands
      this._evKey = evKey(map, spans); this._render();
    } finally { if (seq === this._fetchSeq) this._fetching = false; }
  }
  _stampFor(sum) { for (const r of this._rules) if (r.re.test(sum)) return r.stamp; return ""; }
  // a hand-drawn pencil X, seeded by the date so each day's cross-off is its own but stays put
  _strikeSvg(key) {
    let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const j = (a, b) => a + rnd() * (b - a);
    const stroke = (x1, y1, x2, y2) => { const mx = (x1 + x2) / 2 + j(-9, 9), my = (y1 + y2) / 2 + j(-9, 9); return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" opacity="${j(0.28, 0.52).toFixed(2)}" stroke-width="${j(1.3, 2.4).toFixed(1)}"/>`; };
    let s = stroke(j(3, 13), j(4, 15), j(87, 97), j(85, 96)) + stroke(j(87, 97), j(4, 15), j(3, 13), j(85, 96));
    if (rnd() > 0.55) s += stroke(j(6, 15), j(7, 17), j(85, 95), j(83, 94)); // she sometimes goes over it twice
    return `<svg class="xs" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${s}</svg>`;
  }
  _holidays(y) {
    const h = {
      "01-01": "New Year's Day", "02-14": "Valentine's Day", "03-17": "St. Patrick's Day", "06-19": "Juneteenth", "07-04": "Independence Day",
      "10-31": "Halloween", "11-11": "Veterans Day", "12-24": "Christmas Eve", "12-25": "Christmas", "12-31": "New Year's Eve",
    };
    h[nth(y, 0, 1, 3)] = "M. L. King Jr. Day"; h[nth(y, 1, 1, 3)] = "Presidents' Day"; h[nth(y, 4, 0, 2)] = "Mother's Day";
    h[lastDow(y, 4, 1)] = "Memorial Day"; h[nth(y, 5, 0, 3)] = "Father's Day"; h[nth(y, 8, 1, 1)] = "Labor Day";
    h[nth(y, 9, 1, 2)] = "Columbus Day"; h[nth(y, 10, 4, 4)] = "Thanksgiving";
    // Easter by the Gregorian computus (Meeus/Jones/Butcher)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451),
      em = Math.floor((hh + l - 7 * m + 114) / 31), ed = ((hh + l - 7 * m + 114) % 31) + 1;
    h[`${pad2(em)}-${pad2(ed)}`] = "Easter";
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
    this._paintPop();
    if (this._iso) this._applyIso(); // re-apply after a repaint
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
        return `<div class="lane${sp.s >= w0 ? " lstart" : ""}${sp.e <= w6 ? " lend" : ""}" data-ev="${esc(sp.id || "")}" data-cal="${esc(sp.cal || "")}" style="--hl:${esc(sp.color)};grid-column:${a + 1}/${b + 2};grid-row:${4 + li}"><span class="txt">${sp.t ? `<b>${esc(sp.t)}</b> ` : ""}${esc(sp.sum)}</span>${sp.stamp && sp.stamp !== "cake" ? this._stampSvg(sp.stamp) : ""}</div>`;
      }).join("");
      let ovls = "", chs = "", cellevs = "", adcells = "";
      for (let j = 0; j < 7; j++) {
        const d = wk[j], k = kk[j], inMonth = d.getMonth() === mo;
        const isToday = k === today, past = k < today && c.strike_past;
        const hol = hols[`${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`];
        const evs = (this._events && this._events[k]) || [];
        const bday = evs.some((e) => e.stamp === "cake") || placed.some((p) => p.sp.stamp === "cake" && p.sp.s <= k && p.sp.e >= k);
        ovls += `<div class="dovl${isToday ? " today" : ""}" style="--j:${j}">${bday ? `<div class="bigstamp">${this._stampSvg("cake", "big")}</div>` : ""}${past ? this._strikeSvg(k) : ""}${isToday ? '<div class="td">TODAY</div>' : ""}</div>`;
        const fade = `${inMonth ? "" : " out"}${past ? " fade" : ""}`;
        chs += `<div class="ch${fade}" data-day="${k}" style="grid-column:${j + 1};grid-row:1"><span class="num">${d.getDate()}</span>${hol ? `<span class="hol">${this._stampSvg("star", "hs")}${esc(hol)}</span>` : ""}</div>`;
        const bar = (e) => `<div class="ev${e.allDay ? " ad" : ""}" data-ev="${esc(e.id || "")}" data-cal="${esc(e.cal || "")}" style="--hl:${esc(e.color)}"><span class="txt">${e.t ? `<b>${esc(e.t)}</b> ` : ""}${esc(e.sum)}</span>${e.stamp && !(bday && e.stamp === "cake") ? this._stampSvg(e.stamp) : ""}</div>`;
        const adays = evs.filter((e) => e.allDay), timed = evs.filter((e) => !e.allDay);
        const shownTimed = timed.slice(0, Math.max(1, maxEv - adays.length)), extra = timed.length - shownTimed.length;
        cellevs += `<div class="cellev${fade}" style="grid-column:${j + 1};grid-row:2">${shownTimed.map(bar).join("")}${extra > 0 ? `<div class="more" data-day="${k}">and ${extra} more, see inside</div>` : ""}</div>`;
        adcells += `<div class="adcell${fade}" style="grid-column:${j + 1};grid-row:3">${adays.map(bar).join("")}</div>`;
      }
      weeks.push(`<div class="week"><div class="ovls">${ovls}</div><div class="wgrid" style="grid-template-rows:auto 1fr auto ${"auto ".repeat(maxLanes)}">${chs}${laneBars}${cellevs}${adcells}</div></div>`);
    }
    const cells = weeks;
    const legend = c.calendars.map((x) => `<span class="chip${this._iso === x.entity ? " on" : ""}" data-cal="${esc(x.entity)}" style="--hl:${esc(x.color)}">${esc(x.name)}</span>`).join("");
    const vol = `Vol. ${y - 2020}, No. ${mo + 1}`;
    const body = `
    <svg width="0" height="0" style="position:absolute"><defs><filter id="rub-${this._uid}" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.35" result="a"/>
      <feComposite in="SourceGraphic" in2="a" operator="in"/></filter></defs></svg>
    <div class="mast">
      <div class="mrow1"><span class="mvol">${esc(vol)} · ${esc(c.subtitle)}</span><span class="mname">${esc(c.title)}</span><span class="mleg">${legend}</span></div>
      <div class="mrow2">${c.paper_path ? `<button class="nav paper" data-go="${esc(c.paper_path)}" aria-label="Open the front page" title="Open ${esc(c.title)}">‹ ${esc(c.paper_label)}</button>` : ""}<span class="rule"></span>${c.navigation ? '<button class="nav" data-nav="-1" aria-label="Previous month" title="Previous month (←)">‹ PREV</button>' : ""}<span class="month">${MONTHS[mo]} ${y}</span>${c.navigation ? '<button class="nav" data-nav="1" aria-label="Next month" title="Next month (→)">NEXT ›</button>' : ""}${this._offset !== 0 ? '<button class="ret" data-nav="0" aria-label="Return to the present" title="Return to today (Home)">RETURN TO THE PRESENT</button>' : ""}<span class="rule"></span></div>
    </div>
    <div class="dow">${Array.from({ length: 7 }, (_, i) => `<div>${DOW[(this._ws() + i) % 7]}</div>`).join("")}</div>
    <div class="weeks">${cells.join("")}</div>
    <div class="foot">${esc(c.footer)} · ${c.navigation ? "Swipe or tap PREV / NEXT to turn the month · " : ""}Keys: ← → (PgUp PgDn, p n) turn the month, Shift+← → a year, Home or t returns.</div>`;
    return { sig: today + "|" + this._offset + "|" + this._evKey + "|" + this._fontsReady, html: `<style>${this._css()}</style><div class="page">${body}<div class="popwrap" id="pop"></div></div>` };
  }

  // ---------- tap: clippings, day lists, and calendar isolation ----------
  _onTap(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    const hit = (sel) => path.find((n) => n instanceof Element && n.matches && n.matches(sel));
    // the month controls work even on a strictly read-only wall (tap: false): turning the page edits nothing
    const goEl = hit("[data-go]");
    if (goEl && goEl.dataset.go) { this._go(goEl.dataset.go); return; }
    const navEl = hit("[data-nav]");
    if (navEl) { const d = parseInt(navEl.dataset.nav, 10); this._nav(d === 0 ? 0 : d, d === 0); return; }
    if (!this._cfg.tap) return;
    const pop = this.shadowRoot.getElementById("pop");
    const inPop = pop && path.includes(pop);
    const actEl = hit("[data-act]");
    if (actEl && actEl.dataset.act) { this._act(actEl.dataset.act); return; }
    const evEl = hit("[data-ev]"), dayEl = hit("[data-day]"), calEl = hit(".chip[data-cal]");
    if (evEl && evEl.dataset.ev && this._byId && this._byId[evEl.dataset.ev]) { this._openEvent(evEl.dataset.ev); return; }
    if (!inPop && dayEl && dayEl.dataset.day) { this._openDay(dayEl.dataset.day); return; }
    if (calEl) { this._isolate(calEl.dataset.cal); return; }
    if (this._pop) this._closePop();
  }
  _fmtRange(rec) {
    const dayName = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
    const long = (k) => { const d = dayName(k); return `${DOW[d.getDay()].charAt(0) + DOW[d.getDay()].slice(1).toLowerCase()}, ${MONTHS[d.getMonth()].charAt(0) + MONTHS[d.getMonth()].slice(1).toLowerCase()} ${d.getDate()}`; };
    const short = (k) => { const d = dayName(k); const mon = MONTHS[d.getMonth()]; return `${mon.charAt(0)}${mon.slice(1, 3).toLowerCase()} ${d.getDate()}`; };
    if (rec.s !== rec.e) {
      const nights = Math.round((dayName(rec.e) - dayName(rec.s)) / 86400000);
      return { date: `${short(rec.s)} – ${short(rec.e)}`, time: `${nights} night${nights === 1 ? "" : "s"}${rec.t ? " · from " + rec.t : ""}` };
    }
    if (rec.allDay) return { date: long(rec.s), time: "All day" };
    const endT = rec.end && rec.end.dateTime ? fmtT(rec.end.dateTime) : "";
    return { date: long(rec.s), time: endT && endT !== rec.t ? `${rec.t} – ${endT}` : rec.t };
  }
  // Home Assistant's in-app navigation: push the path and tell the shell, so kiosk-mode and the
  // sidebar state survive and the wall tablet does not do a full reload.
  _go(path) {
    try { window.history.pushState(null, "", path); window.dispatchEvent(new Event("location-changed")); }
    catch (e) { if (typeof location !== "undefined") location.assign(path); }
  }
  // a calendar Home Assistant can write to (local calendars; feeds and read-only mirrors cannot)
  _canDelete(cal) { const st = this._hass && this._hass.states && this._hass.states[cal]; return !!(st && ((st.attributes.supported_features || 0) & 2)); }
  _openEvent(id) {
    const r = this._byId && this._byId[id]; if (!r) return;
    this._popId = id;
    const { date, time } = this._fmtRange(r);
    const body = r.desc ? esc(r.desc.trim()).replace(/\n/g, "<br>") : "";
    const canHide = !!this._cfg.hidden_list, canDel = this._canDelete(r.cal);
    const acts = canHide || canDel ? `<div class="acts">${canHide ? (r.hidden ? '<button class="act" data-act="unhide">SHOW ON THE WALL</button>' : '<button class="act" data-act="hide">HIDE FROM THE WALL</button>') : ""}${canDel ? `<button class="act del" data-act="del">${this._confirmDel === id ? "TAP AGAIN TO DELETE" : "DELETE"}</button>` : ""}</div>` : "";
    this._pop = { html: `<div class="scrim"></div><div class="clip${r.hidden ? " hidden" : ""}" style="--hl:${esc(r.color)}"><div class="tape"></div>
      <div class="kick">${esc(date)} · ${esc(time)}${r.hidden ? " · HIDDEN FROM THE WALL" : ""}</div>
      <div class="ttl${r.hidden ? " hid" : ""}">${esc(r.sum)}</div>
      ${r.loc ? `<div class="agate"><b>WHERE</b>${esc(r.loc)}</div>` : ""}
      ${body ? `<div class="body">${body}</div>` : ""}
      ${acts}
      ${r.stamp ? `<div class="clipstamp">${this._stampSvg(r.stamp, "big")}</div>` : ""}
    </div>` };
    this._paintPop();
  }
  // the clipping's buttons: hide / show on the wall (a to-do item per event id), and delete on a writable calendar
  async _act(act) {
    const r = this._byId && this._byId[this._popId]; if (!r || !this._hass) return;
    if (act === "del") {
      if (!this._canDelete(r.cal)) return;
      // a wall tablet gets no confirm dialog: the first tap arms the button, the second within 6 s deletes
      if (this._confirmDel !== r.id) { this._confirmDel = r.id; clearTimeout(this._delT); this._delT = setTimeout(() => { this._confirmDel = null; if (this._pop && this._popId === r.id) this._openEvent(r.id); }, 6000); this._openEvent(r.id); return; }
      this._confirmDel = null; clearTimeout(this._delT);
    }
    try {
      if (act === "hide") await this._hass.callService("todo", "add_item", { item: r.id, description: `${r.sum} · ${r.s}` }, { entity_id: this._cfg.hidden_list });
      else if (act === "unhide") await this._hass.callService("todo", "remove_item", { item: r.id }, { entity_id: this._cfg.hidden_list });
      else if (act === "del") await this._hass.callWS(Object.assign({ type: "calendar/event/delete", entity_id: r.cal, uid: r.uid }, r.rid ? { recurrence_id: r.rid, recurrence_range: "" } : {}));
      else return;
    } catch (e) { /* the clipping stays; the next fetch prints the truth */ }
    this._closePop(); this._fetchAt = 0; this._maybeFetch();
  }
  _openDay(k) {
    const evs = ((this._events && this._events[k]) || []).slice();
    const spans = (this._spans || []).filter((sp) => sp.s <= k && sp.e >= k);
    // hidden events still appear here, struck through, so they can be found and shown again
    const hid = (this._hiddenRecs || []).filter((r) => r.s <= k && r.e >= k).map((r) => ({ id: r.id, color: r.color, when: r.allDay ? "all day" : r.t, what: r.sum, stamp: r.stamp, hidden: true }));
    const rows = [...spans.map((sp) => ({ id: sp.id, color: sp.color, when: sp.t || "all day", what: sp.sum, stamp: sp.stamp })),
      ...evs.filter((e) => e.allDay).map((e) => ({ id: e.id, color: e.color, when: "all day", what: e.sum, stamp: e.stamp })),
      ...evs.filter((e) => !e.allDay).map((e) => ({ id: e.id, color: e.color, when: e.t, what: e.sum, stamp: e.stamp })),
      ...hid];
    const shown = rows.length - hid.length;
    const [y, m, d] = k.split("-").map(Number); const dt = new Date(y, m - 1, d);
    const hol = this._cfg.show_holidays ? this._holidays(y)[`${pad2(m)}-${pad2(d)}`] : "";
    const list = rows.length ? rows.map((r) => `<div class="row${r.hidden ? " hid" : ""}" data-ev="${esc(r.id || "")}" style="--hl:${esc(r.color)}"><span class="when">${esc(r.when)}</span><span class="what">${esc(r.what)}</span>${r.stamp ? this._stampSvg(r.stamp) : ""}</div>`).join("") : `<div class="agate">Nothing on the books. A quiet day, or an unrecorded one.</div>`;
    this._pop = { html: `<div class="scrim"></div><div class="clip day" style="--hl:${INK}"><div class="tape"></div>
      <div class="kick">${DOW[dt.getDay()]} · ${MONTHS[m - 1]} ${d} · ${shown} ${shown === 1 ? "entry" : "entries"}${hid.length ? ` · ${hid.length} hidden` : ""}${hol ? " · " + esc(hol).toUpperCase() : ""}</div>
      <div class="ttl">The day, in full</div>
      <div class="list">${list}</div>
    </div>` };
    this._paintPop();
  }
  _closePop() { this._pop = null; clearTimeout(this._popT); this._paintPop(); }
  _paintPop() {
    const sr = this.shadowRoot;
    const pop = sr && typeof sr.getElementById === "function" ? sr.getElementById("pop") : null;
    if (pop) pop.innerHTML = this._pop ? this._pop.html : "";
    clearTimeout(this._popT);
    if (this._pop && this._cfg.popup_seconds > 0) this._popT = setTimeout(() => this._closePop(), this._cfg.popup_seconds * 1000);
  }
  _applyIso() {
    const sr = this.shadowRoot; if (!sr || typeof sr.querySelectorAll !== "function") return;
    sr.querySelectorAll("[data-cal]").forEach((el) => {
      if (el.classList.contains("chip")) el.classList.toggle("on", !!this._iso && el.dataset.cal === this._iso);
      else el.classList.toggle("dim", !!this._iso && el.dataset.cal !== this._iso);
    });
  }
  _isolate(cal) {
    clearTimeout(this._isoT);
    this._iso = cal && this._iso !== cal ? cal : null;
    this._applyIso();
    if (this._iso && this._cfg.isolate_seconds > 0) this._isoT = setTimeout(() => this._isolate(null), this._cfg.isolate_seconds * 1000);
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
  .month { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: 2.5vmin; letter-spacing: 0.35vw; min-width: 24vmin; text-align: center; }
  /* the month controls: set like a running head, sized for a finger on the wall tablet */
  .nav, .ret { font-family: Archivo, 'Segoe UI', sans-serif; font-size: 1.25vmin; font-weight: 700; letter-spacing: 0.25vw; color: ${BROWN}; background: transparent; border: 1.5px solid ${BROWN}; border-radius: 0; padding: 0 1.2vw; min-height: 4.2vmin; min-width: 11vmin; cursor: pointer; white-space: nowrap; user-select: none; -webkit-tap-highlight-color: transparent; }
  .nav:active, .ret:active { background: color-mix(in srgb, ${BROWN} 18%, transparent); }
  .ret { color: ${TERRA}; border-color: ${TERRA}; transform: rotate(-2deg); margin-left: 0.6vw; }
  .nav.paper { color: ${TAN}; border-color: ${TAN}; margin-right: 0.6vw; }
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
  .adcell { padding: 0 0.35vw 0.2vmin; display: flex; flex-direction: column; gap: 0.28vmin; overflow: hidden; min-width: 0; }
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
  .xs { position: absolute; inset: 1% 3%; width: 94%; height: 98%; pointer-events: none; stroke: ${GRAPHITE}; fill: none; stroke-linecap: round; }
  .xs path { vector-effect: non-scaling-stroke; }
  .td { position: absolute; right: 0.3vw; bottom: 0.3vmin; font-size: 1vmin; font-weight: 700; letter-spacing: 0.25vw; color: ${TERRA}; border: 1.5px solid ${TERRA}; padding: 0.1vmin 0.35vw; transform: rotate(-3deg); opacity: .85; }
  .foot { text-align: center; font-size: 1.1vmin; color: ${TAN}; letter-spacing: 0.08vw; padding: 0.5vmin 0 0.3vmin; }
  /* tap: clippings pinned over the grid */
  .page { position: relative; }
  .ev, .lane, .ch, .more, .chip, .clip .row { cursor: pointer; }
  .dim { opacity: .12 !important; transition: opacity .35s; }
  .chip.on { outline: 2px solid var(--hl); outline-offset: 1px; }
  .popwrap:empty { display: none; }
  .scrim { position: absolute; inset: 0; background: rgba(58,45,31,.16); z-index: 5; }
  .clip { position: absolute; left: 50%; top: 50%; width: min(66vmin, 92vw); max-height: 82vh; overflow: hidden; transform: translate(-50%, -50%) rotate(-1.4deg);
    background: #f6efdc; color: ${INK}; border: 1.5px solid ${INK}; border-left: 1.1vmin solid var(--hl); box-shadow: 0 1.5vmin 4vmin rgba(58,45,31,.38), 0 0 0 3px #f6efdc; padding: 2.8vmin 2.8vmin 2.4vmin 2.6vmin; z-index: 6; }
  .clip.day { border-left-color: ${INK}; }
  .tape { position: absolute; top: -1.3vmin; left: 50%; width: 10vmin; height: 2.6vmin; background: rgba(163,135,106,.42); transform: translateX(-50%) rotate(-3deg); box-shadow: 0 1px 2px rgba(0,0,0,.18); }
  .kick { font-size: 1.35vmin; font-weight: 700; letter-spacing: 0.25vw; color: ${TAN}; text-transform: uppercase; padding-right: 8vmin; }
  .ttl { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: 3.4vmin; line-height: 1.1; margin: 0.8vmin 0 1.2vmin; text-wrap: balance; padding-right: 6vmin; }
  .agate { font-size: 1.65vmin; color: ${BROWN}; margin-top: 0.6vmin; line-height: 1.35; }
  .agate b { font-weight: 700; letter-spacing: 0.2vw; font-size: 1.15vmin; color: ${TAN}; margin-right: 0.6vw; }
  .body { font-family: Fraunces, Georgia, serif; font-size: 1.85vmin; line-height: 1.42; margin-top: 1.1vmin; max-height: 38vh; overflow: hidden; padding-right: 5vmin; }
  .clipstamp { position: absolute; right: 1.2vmin; bottom: 0.9vmin; width: 12vmin; height: 12vmin; opacity: .35; pointer-events: none; }
  .clipstamp .stamp { width: 100%; height: 100%; transform: rotate(-12deg); }
  .list { margin-top: 0.4vmin; max-height: 60vh; overflow: hidden; }
  .clip .row { display: flex; align-items: center; gap: 0.6vw; padding: 0.55vmin 0.6vw; margin: 0.4vmin 0; background: color-mix(in srgb, var(--hl) 26%, transparent); border-left: 0.3vw solid var(--hl); font-size: 1.8vmin; }
  .clip .row .when { font-weight: 700; flex: none; min-width: 7.5vmin; color: #241c12; }
  .clip .row .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  /* hidden events: struck through in the day list, and the clipping's title */
  .clip .row.hid { opacity: .45; }
  .clip .row.hid .what, .ttl.hid { text-decoration: line-through; text-decoration-thickness: 2px; }
  .ttl.hid { opacity: .55; }
  .acts { display: flex; flex-wrap: wrap; gap: 0.8vw; margin-top: 1.4vmin; padding-right: 6vmin; }
  .act { font-family: Archivo, 'Segoe UI', sans-serif; font-size: 1.25vmin; font-weight: 700; letter-spacing: 0.25vw; color: ${BROWN}; background: transparent; border: 1.5px solid ${BROWN}; border-radius: 0; padding: 0 1.2vw; min-height: 4.2vmin; cursor: pointer; white-space: nowrap; user-select: none; -webkit-tap-highlight-color: transparent; }
  .act:active { background: color-mix(in srgb, ${BROWN} 18%, transparent); }
  .act.del { color: #7e1d10; border-color: #7e1d10; }`;
  }
}

// One font sheet for every Homestead Times card: the first card to load injects it, the rest find it.
if (!document.getElementById("homestead-times-font")) {
  const l = document.createElement("link");
  l.id = "homestead-times-font"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,400&family=Archivo:wght@400;500;600;700&display=swap";
  document.head.appendChild(l);
}
customElements.define("homestead-month-card", HomesteadMonthCard);
console.info(`%c HOMESTEAD-MONTH-CARD %c ${HCM_VERSION} `, "background:#3a2d1f;color:#f3e7d3;font-weight:700", "background:#b03a26;color:#fff;font-weight:700");
window.customCards = window.customCards || [];
window.customCards.push({ type: "homestead-month-card", name: "Homestead Month Card", description: "A full-screen newsprint month calendar for wall displays: highlighter bars per calendar, holidays, struck past days, rubber-stamp icons and tap-for-clipping.", preview: true, documentationURL: "https://github.com/LoneWolf345/homestead-month-card" });
