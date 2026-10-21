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
  // Degrees and professional certificates (40ג, 40ד), by completion year (supplied table + Kol Zchut).
  // Points start the tax year after completion. Graduates of 2014-2022 may defer one year (deg.defer).
  // A profession requiring an internship that began in the completion year or the next one may, by the
  // taxpayer's choice (deg.internDefer), start the year after the internship ends (deg.internEnd).
  function degreePoints(deg, year) {
    const done = +deg.year; if (!done || done < 2014) return 0;
    let start = done + 1;
    if (deg.defer && done <= 2022) start += 1;
    if (deg.internDefer && deg.internEnd && +deg.internEnd >= done) start = Math.max(start, +deg.internEnd + 1);
    const n = year - start; if (n < 0) return 0;
    const span = k => Math.min(k, Math.max(1, +deg.studyYears || 1));
    const recent = done >= 2023;
    switch (deg.type) {
      case 'BA': return recent ? (n < span(3) ? 1 : 0) : (n === 0 ? 1 : 0);
      case 'MA': return recent ? (n < span(2) ? 0.5 : 0) : (n === 0 ? 0.5 : 0);   // two years, by years of study
      case 'PHD': return recent ? (n < 2 ? 0.5 : 0) : (n === 0 ? 0.5 : 0);         // direct-track doctorate
      case 'MED': return recent ? (n < 3 ? 1 : n < 5 ? 0.5 : 0) : (n === 0 ? 1 : n === 1 ? 0.5 : 0);
      case 'CERT':
        if (recent) return n < span(3) ? 1 : 0;
        if (n !== 0) return 0;
        return done >= 2018 ? 1 : done === 2017 ? 0.75 : 0.5;
      default: return 0;
    }
  }

  const DEGREE_LABEL = { BA: 'תואר ראשון', MA: 'תואר שני', PHD: 'תואר שלישי ישיר', MED: 'רפואה / רפואת שיניים', CERT: 'תעודת מקצוע' };

  // Reserve combat service (39ב, temporary order 2026-2027): points by days served in the previous year.
  function reservePoints(days, year) {
    if (year < 2026 || !days || days < 30) return 0;
    if (days < 40) return 0.5;
    if (days < 50) return 0.75;
    return Math.min(4, 1 + 0.25 * Math.floor((days - 50) / 5));
  }

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
    add('ילדים', kids); // tables supplied for 2020-2025 and 2026
    add('ילד נטול יכולת', disabled);
    // Sole parent: both tables plus one point (2026 table). A lone parent also gets one point; never twice.
    if (p.singleParent || p.loneParent) add(p.singleParent ? 'הורה יחיד' : 'חד הורי', 1);
    add('עולה / תושב חוזר', immigrantPoints(p.immigrant, year));
    if (p.soldier) add('חייל משוחרר / שירות לאומי', soldierPoints(p.soldier.discharge, p.soldier.full, year));
    // Education: the taxpayer chooses degrees OR a professional certificate (eduTrack); default by what was entered.
    // One of each degree. A direct doctorate is not given on top of a master's. Medicine: on top of a used
    // bachelor's point only the half point is given; with bachelor's and master's points, none.
    const first = t => (p.degrees || []).find(d => d.type === t);
    const hasDegree = ['BA', 'MA', 'PHD', 'MED'].some(first);
    const track = p.eduTrack || (hasDegree ? 'degrees' : 'cert');
    if (track === 'cert') { if (first('CERT')) add(DEGREE_LABEL.CERT, degreePoints(first('CERT'), year)); }
    else {
      for (const t of ['BA', 'MA']) if (first(t)) add(DEGREE_LABEL[t], degreePoints(first(t), year));
      if (first('PHD') && !first('MA')) add(DEGREE_LABEL.PHD, degreePoints(first('PHD'), year));
      if (first('MED')) {
        const m = degreePoints(first('MED'), year);
        if (!first('BA') && !first('MA')) add(DEGREE_LABEL.MED, m);
        else if (first('BA') && !first('MA')) add(DEGREE_LABEL.MED, m === 0.5 ? 0.5 : 0, true);
      }
    }
    add('לוחם מילואים', reservePoints((p.reserveDays || {})[year - 1], year));
    if (p.alimonyFrom && year >= +p.alimonyFrom) add('מזונות לבן זוג לשעבר', 1);
    const total = Math.round(items.reduce((s, i) => s + i.pts, 0) * 10000) / 10000;
    return { total, items };
  }

  // ---------- Shekel credits (fixed per year, computed on the regular income) ----------
  // Sources: "ניתוב שלב א'" 2023-2025 and the credits training booklet in the team knowledge base.
  // null = not in the material (no limit applied). Checked against the monthly deduction booklets 2020-2026.
  const CREDIT_PARAMS = {
    2020: { eilatCeil: 242520, donationMin: 190, shiftMax: 11340, shiftCeil: 129120, soldierCeil: 161040 },
    2021: { eilatCeil: 241080, donationMin: 190, shiftMax: 11280, shiftCeil: 128400, soldierCeil: 160080 },
    2022: { eilatCeil: 246840, donationMin: 190, shiftMax: 11520, shiftCeil: 131520, soldierCeil: 163920 },
    2023: { eilatCeil: 259800, donationMin: 200, shiftMax: 12120, shiftCeil: 138480, soldierCeil: 172560 },
    2024: { eilatCeil: 268560, donationMin: 207, shiftMax: 12540, shiftCeil: 143040, soldierCeil: 178320 },
    2025: { eilatCeil: 268560, donationMin: 207, shiftMax: 12540, shiftCeil: 143040, soldierCeil: 178320 },
    2026: { eilatCeil: 268560, donationMin: 207, shiftMax: 12540, shiftCeil: 143040, soldierCeil: 178320 },
  };

  // cr: { settleRate (%), settleCeil, settleMonths, settleParts ([months, rate %, ceiling] per period of the
  //       town's list, used when no manual rate and ceiling are given), eilatIncome, pension, life, donation, shiftWage,\n  //       soldierSalary, soldierCeil (only where the year has no ceiling in the material), other }
  function shekelCredits(year, income, cr) {
    cr = cr || {};
    const P = CREDIT_PARAMS[year] || {}, assumed = P.assumed || [];
    const items = [];
    const add = (label, amount, verify) => { if (amount > 0) items.push({ label, amount, verify: !!verify }); };
    const inc = Math.max(0, income || 0);
    // Qualifying town (סעיף 11): rate × min(income, ceiling), proportional to months of residence.
    // A town whose rate or ceiling changed during the year has one part per period, weighted by its months.
    const months = cr.settleMonths == null ? 12 : Math.max(0, Math.min(12, cr.settleMonths));
    if (cr.settleRate && cr.settleCeil) {
      add('יישוב מזכה', cr.settleRate / 100 * Math.min(inc, cr.settleCeil) * months / 12);
    } else if (cr.settleParts && cr.settleParts.length) {
      const full = cr.settleParts.reduce((s, [m, rate, ceil]) => s + rate / 100 * Math.min(inc, ceil) * m / 12, 0);
      add('יישוב מזכה', full * months / 12);
    }
    // Soldier with a special salary (11(ג)): 5% up to the ceiling. The taxpayer chooses either this
    // or the qualifying-town credit, so only the larger of the two is kept.
    if (cr.soldierSalary) {
      const ceil = P.soldierCeil != null ? P.soldierCeil : cr.soldierCeil;
      const soldier = 0.05 * Math.min(cr.soldierSalary, ceil || Infinity);
      const town = items.find(i => i.label === 'יישוב מזכה');
      if (!town) add('חייל – משכורת מיוחדת', soldier, !ceil);
      else if (soldier > town.amount) { items.splice(items.indexOf(town), 1); add('חייל – משכורת מיוחדת (במקום יישוב)', soldier, !ceil); }
      else town.label = 'יישוב מזכה (במקום חייל)';
    }
    // Eilat: 10% of income produced in Eilat, up to the annual ceiling.
    if (cr.eilatIncome) add('אילת', 0.10 * Math.min(cr.eilatIncome, P.eilatCeil || Infinity));
    // Pension (45א): 35%; life insurance: 25%; amounts are the qualifying deposits from form 106.
    if (cr.pension) add('פנסיה', 0.35 * cr.pension);
    if (cr.life) add('ביטוח חיים', 0.25 * cr.life);
    // Donations (46): 35% above the yearly minimum, donation base capped at 30% of taxable income.
    if (cr.donation && (P.donationMin == null || cr.donation > P.donationMin))
      add('תרומות', 0.35 * Math.min(cr.donation, 0.30 * inc), P.donationMin == null || assumed.includes('donationMin'));
    // Shift work in industry: 15% of the shift wage that, added to the salary, stays under the ceiling; capped.
    if (cr.shiftWage) {
      const other = Math.max(0, inc - cr.shiftWage);
      const eligible = P.shiftCeil == null ? cr.shiftWage : Math.max(0, Math.min(cr.shiftWage, P.shiftCeil - other));
      add('משמרות', Math.min(0.15 * eligible, P.shiftMax == null ? Infinity : P.shiftMax),
        P.shiftMax == null || assumed.includes('shiftMax'));
    }
    if (cr.other) add('זיכוי אחר', cr.other);
    return { total: items.reduce((s, i) => s + i.amount, 0), items };
  }

  // ---------- Spread ----------
  // Severance backward spread: equal parts over n tax years ending in the payment year (n <= 6).
  // Shares of years before MIN_YEAR are not spread: they are added to the payment year.
  function severanceYears(total, payYear, n) {
    n = Math.max(1, Math.min(6, Math.floor(n)));
    const share = Math.floor(total / n), out = [];
    let carried = 0;
    for (let i = n - 1; i >= 0; i--) {
      const year = payYear - i, alloc = i === 0 ? total - share * (n - 1) : share;
      if (year < MIN_YEAR) { carried += alloc; continue; }
      out.push({ year, alloc: i === 0 ? alloc + carried : alloc });
    }
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
    // Payroll computes the payment as ordinary current-year income (= noSpread). The forced credit
    // ("זיכוי מאולץ") closes the gap to the tax actually due under the spread.
    return { lines, sumAlloc, sumTax, rate: sumAlloc ? sumTax / sumAlloc : NaN, noSpread, forcedCredit: noSpread - sumTax };
  }

  // Refund report for the payment year: move the prior-year share out of that year's income and withheld tax.
  function refundAdjust(spread, payYear, income106, tax106) {
    const prev = spread.lines.filter(l => l.year < payYear);
    const prevIncome = prev.reduce((s, l) => s + l.alloc, 0), prevTax = prev.reduce((s, l) => s + l.add, 0);
    return {
      prevIncome, prevTax,
      income: income106 == null ? null : income106 - prevIncome,
      tax: tax106 == null ? null : tax106 - prevTax,
    };
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
      // Equal parts across spread years; the payment year may also hold shares of years before MIN_YEAR.
      const others = input.lines.filter(l => l.year !== input.payYear).map(l => l.alloc);
      const own = (input.lines.find(l => l.year === input.payYear) || {}).alloc;
      const tol = input.lines.length;
      if (others.length && (Math.max(...others) - Math.min(...others) > tol || (own != null && own < Math.min(...others) - tol)))
        errs.push('בפריסת פיצויים אחורה החלקים צריכים להיות שווים.');
    }
    return errs;
  }

  const api = { TAX, YEARS, MIN_YEAR, MAX_YEAR, grossTax, netTax, childPoints, immigrantPoints, soldierPoints, degreePoints, creditPoints, reservePoints, CREDIT_PARAMS, shekelCredits, severanceYears, computeSpread, refundAdjust, validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TaxEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
