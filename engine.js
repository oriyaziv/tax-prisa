// Tax spread engine: Israeli income-tax brackets 2020-2026, credit points, spread calculation.
// Works in the browser (window.TaxEngine) and in Node (module.exports).
(function (root) {
  'use strict';

  // Annual brackets on personal-exertion income: [upper limit, rate %]. Top 50% includes the 3% surtax.
  // cp = annual value of one credit point (₪).
  const TAX = {
    2020: { cp: 2628, b: [[75960, 10], [108960, 14], [174960, 20], [243120, 31], [505920, 35], [651600, 47], [Infinity, 50]] },
    2021: { cp: 2616, b: [[75480, 10], [108360, 14], [173880, 20], [241680, 31], [502920, 35], [647640, 47], [Infinity, 50]] },
    2022: { cp: 2676, b: [[77400, 10], [110880, 14], [178080, 20], [247440, 31], [514920, 35], [663240, 47], [Infinity, 50]] },
    2023: { cp: 2820, b: [[81480, 10], [116760, 14], [187440, 20], [260520, 31], [542160, 35], [698280, 47], [Infinity, 50]] },
    2024: { cp: 2904, b: [[84120, 10], [120720, 14], [193800, 20], [269280, 31], [560280, 35], [721560, 47], [Infinity, 50]] },
    2025: { cp: 2904, b: [[84120, 10], [120720, 14], [193800, 20], [269280, 31], [560280, 35], [721560, 47], [Infinity, 50]] },
    2026: { cp: 2904, b: [[84120, 10], [120720, 14], [228000, 20], [301200, 31], [560280, 35], [721560, 47], [Infinity, 50]] },
  };
  const YEARS = Object.keys(TAX).map(Number);
  const MIN_YEAR = YEARS[0], MAX_YEAR = YEARS[YEARS.length - 1];

  function hasYear(y) { return Object.prototype.hasOwnProperty.call(TAX, y); }

  function grossTax(income, year) {
    if (!hasYear(year)) throw new Error('אין מדרגות מס לשנת ' + year);
    let t = 0, prev = 0;
    for (const [cap, r] of TAX[year].b) {
      if (income <= prev) break;
      t += (Math.min(income, cap) - prev) * r / 100;
      prev = cap;
    }
    return t;
  }

  // Tax after credit points and other shekel credits (pension, donations, qualifying town...). Never negative.
  function netTax(income, year, points, extraCredit) {
    return Math.max(0, grossTax(Math.max(0, income), year) - (points || 0) * TAX[year].cp - (extraCredit || 0));
  }

  // ---------- Credit points ----------
  // Every rule carries `verify: true` when the sources found disagree or are not official; the UI flags those.

  // Child points by age in the tax year (age = taxYear - birthYear; 0 = birth year).
  // Table A: a woman, or the parent who has the child and receives the child allowance.
  // Table B: a man, or a parent who does not. Source: the 2020-2025 summary table supplied by the user.
  // `defer`: table A may move one point from the birth year to age 1.
  function childPoints(age, year, parent, defer) {
    if (age < 0 || age > 18) return 0;
    const mother = parent === 'F' || parent === 'A';
    if (mother && defer && (age === 0 || age === 1)) return childPoints(age, year, 'A') + (age === 0 ? -1 : 1);
    if (age === 18) return mother ? 0.5 : 0;
    if (year >= 2024) {
      if (age === 0) return 2.5;
      if (age <= 2) return 4.5;
      if (age === 3) return 3.5;
      if (age <= 5) return 2.5;
      return mother ? 2 : 1;               // 6-17
    }
    // 2020-2023
    if (age === 0) return 1.5;
    if (age <= 5) return 2.5;
    let p = mother ? 1 : 0;                // 6-17 regular point: mother only
    if (year >= 2022 && age <= 12) p += 1; // temporary order 2022-2023, ages 6-12, both parents
    return p;
  }

  // Monthly schedules: list of [months, annual points]; returns points falling inside tax year `year`.
  function scheduledPoints(startYear, startMonth, schedule, year) {
    let y = startYear, m = startMonth, total = 0;
    for (const [months, pts] of schedule) {
      for (let i = 0; i < months; i++) {
        if (y === year) total += pts / 12;
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    return total;
  }

  function parseYM(s) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(String(s || '').trim());
    return m ? { y: +m[1], m: +m[2] } : null;
  }

  function immigrantPoints(arrival, year) {
    const a = parseYM(arrival); if (!a) return 0;
    // Arrivals from 1.1.2022: 12 months at 1, then 18 at 3, 12 at 2, 12 at 1. Earlier: 18 at 3, 12 at 2, 12 at 1.
    const sched = a.y >= 2022 ? [[12, 1], [18, 3], [12, 2], [12, 1]] : [[18, 3], [12, 2], [12, 1]];
    return scheduledPoints(a.y, a.m, sched, year);
  }

  function soldierPoints(discharge, fullService, year) {
    const d = parseYM(discharge); if (!d) return 0;
    let y = d.y, m = d.m + 1; if (m > 12) { m = 1; y++; } // from the month after discharge
    return scheduledPoints(y, m, [[36, fullService ? 2 : 1]], year);
  }

  // Degrees: points start the tax year after completion.
  function degreePoints(deg, year) {
    const done = +deg.year; if (!done) return 0;
    const n = year - done; if (n < 1) return 0;
    const studyYears = Math.max(1, +deg.studyYears || 1);
    switch (deg.type) {
      case 'BA': return done >= 2023 ? (n <= Math.min(3, studyYears) ? 1 : 0) : (n === 1 ? 1 : 0);
      case 'MA': return done >= 2023 ? (n <= Math.min(2, studyYears) ? 0.5 : 0) : (n === 1 ? 0.5 : 0);
      case 'CERT': return n === 1 ? 1 : 0;
      default: return 0;
    }
  }

  const DEGREE_LABEL = { BA: 'תואר ראשון', MA: 'תואר שני', CERT: 'תעודת מקצוע' };

  // profile: { gender:'M'|'F', childTable:'A'|'B' (default by gender), resident, children:[{birthYear, disabled, defer}], singleParent (both tables), loneParent (+1 point),
  //   immigrant:'YYYY-MM', soldier:{discharge:'YYYY-MM', full}, degrees:[{type, year, studyYears}] }
  function creditPoints(profile, year) {
    const p = profile || {};
    const items = [];
    const add = (label, pts, verify) => { if (pts) items.push({ label, pts: Math.round(pts * 10000) / 10000, verify: !!verify }); };
    if (p.resident !== false) add('תושב ישראל', 2.25);
    if (p.gender === 'F') add('אישה', 0.5);
    let kids = 0, disabled = 0;
    for (const c of p.children || []) {
      const by = +c.birthYear; if (!by) continue;
      // A single parent receives both tables cumulatively.
      const tables = p.singleParent ? ['A', 'B'] : [p.childTable || (p.gender === 'F' ? 'A' : 'B')];
      for (const t of tables) kids += childPoints(year - by, year, t, c.defer);
      if (c.disabled && year - by <= 18) disabled += 2;
    }
    add('ילדים', kids, year > 2025); // table verified for 2020-2025; 2026 assumes the 2024-2025 rules
    add('ילד נטול יכולת', disabled);
    if (p.loneParent) add('חד הורי', 1);
    add('עולה / תושב חוזר', immigrantPoints(p.immigrant, year));
    if (p.soldier) add('חייל משוחרר / שירות לאומי', soldierPoints(p.soldier.discharge, p.soldier.full, year));
    for (const d of p.degrees || []) add(DEGREE_LABEL[d.type] || 'השכלה', degreePoints(d, year), true);
    const total = Math.round(items.reduce((s, i) => s + i.pts, 0) * 10000) / 10000;
    return { total, items };
  }

  // ---------- Spread ----------
  // Severance backward spread: equal parts over n tax years ending in the payment year (n <= 6).
  function severanceYears(total, payYear, n) {
    n = Math.max(1, Math.min(6, Math.floor(n)));
    const share = Math.floor(total / n), out = [];
    for (let i = n - 1; i >= 0; i--) out.push({ year: payYear - i, alloc: i === 0 ? total - share * (n - 1) : share });
    return out;
  }

  // input: { total, payYear, lines:[{year, alloc, base, points, extraCredit}], pay:{base, points, extraCredit} }
  function computeSpread(input) {
    const lines = input.lines.map(l => {
      const t0 = netTax(l.base, l.year, l.points, l.extraCredit);
      const t1 = netTax(l.base + l.alloc, l.year, l.points, l.extraCredit);
      return Object.assign({}, l, { t0, t1, add: t1 - t0, rate: l.alloc ? (t1 - t0) / l.alloc : NaN });
    });
    const sumAlloc = lines.reduce((s, l) => s + l.alloc, 0);
    const sumTax = lines.reduce((s, l) => s + l.add, 0);
    const py = input.pay;
    const noSpread = netTax(py.base + input.total, input.payYear, py.points, py.extraCredit) - netTax(py.base, input.payYear, py.points, py.extraCredit);
    return { lines, sumAlloc, sumTax, rate: sumAlloc ? sumTax / sumAlloc : NaN, noSpread, saving: noSpread - sumTax };
  }

  function validate(input, type) {
    const errs = [];
    const seen = new Set();
    for (const l of input.lines) {
      if (!hasYear(l.year)) errs.push('אין מדרגות מס לשנת ' + l.year + '.');
      if (l.year > input.payYear) errs.push('שנת ' + l.year + ' מאוחרת משנת התשלום. פריסה קדימה אינה נתמכת.');
      if (seen.has(l.year)) errs.push('שנת ' + l.year + ' מופיעה יותר מפעם אחת.');
      seen.add(l.year);
      if (l.alloc < 0 || l.base < 0) errs.push('בשנת ' + l.year + ' יש סכום שלילי.');
    }
    const sum = input.lines.reduce((s, l) => s + l.alloc, 0);
    if (Math.abs(sum - input.total) >= 1) errs.push('סך הסכומים המיוחסים שונה מסכום התשלום.');
    if (type === 'severance') {
      if (input.lines.length > 6) errs.push('פריסת פיצויים אחורה מוגבלת ל-6 שנות מס.');
      const ys = input.lines.map(l => l.year).sort((a, b) => a - b);
      if (ys.length && ys[ys.length - 1] !== input.payYear) errs.push('בפריסת פיצויים אחורה השנה האחרונה היא שנת התשלום.');
      if (ys.some((y, i) => i && y !== ys[i - 1] + 1)) errs.push('בפריסת פיצויים השנים צריכות להיות רצופות.');
      const allocs = input.lines.map(l => l.alloc);
      if (allocs.length && Math.max(...allocs) - Math.min(...allocs) > allocs.length) errs.push('בפריסת פיצויים אחורה החלקים צריכים להיות שווים.');
    }
    return errs;
  }

  const api = { TAX, YEARS, MIN_YEAR, MAX_YEAR, grossTax, netTax, childPoints, immigrantPoints, soldierPoints, degreePoints, creditPoints, severanceYears, computeSpread, validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TaxEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
