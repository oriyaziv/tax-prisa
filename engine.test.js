// Run: node --test engine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('2026 monthly anchor: 15,000/month, 2.25 points ≈ 1,572/month (published example)', () => {
  near(E.netTax(180000, 2026, 2.25) / 12, 1571.5, 0.5);
});

test('gross tax, hand-computed', () => {
  near(E.grossTax(200000, 2024), 30074);
  near(E.grossTax(200000, 2026), 29392);         // 2026 wider 20% bracket
  near(E.grossTax(800000, 2026), 263383.6);      // reaches 50% (surtax)
  near(E.grossTax(75960, 2020), 7596);           // exactly first bracket edge
  near(E.grossTax(0, 2022), 0);
});

test('net tax with credit points', () => {
  near(E.netTax(200000, 2024, 2.25), 23540);
  near(E.netTax(0, 2024, 2.25), 0);
  near(E.netTax(20000, 2024, 2.25), 0);          // credits exceed tax -> 0, never negative
  near(E.netTax(100000, 2024, 2.25), 4101.2);
  near(E.netTax(200000, 2024, 2.25, 1000), 22540); // extra shekel credit
});

test('2025 identical to 2024 (freeze); 2026 differs only in 20%/31% bands', () => {
  for (const inc of [50000, 150000, 193800, 400000, 900000]) near(E.grossTax(inc, 2025), E.grossTax(inc, 2024));
  near(E.grossTax(120720, 2026), E.grossTax(120720, 2024));
  near(E.grossTax(600000, 2026), E.grossTax(600000, 2024) - (228000 - 193800) * 0.11 - (301200 - 269280) * 0.04);
});

test('unknown year throws', () => {
  assert.throws(() => E.grossTax(1000, 2019));
  assert.throws(() => E.grossTax(1000, 2027));
});

test('children points', () => {
  assert.equal(E.childPoints(2, 2024, 'F'), 4.5);
  assert.equal(E.childPoints(3, 2024, 'M'), 3.5);
  assert.equal(E.childPoints(0, 2023, 'F'), 1.5);
  assert.equal(E.childPoints(4, 2021, 'M'), 2.5);
  assert.equal(E.childPoints(7, 2021, 'M'), 0);
  assert.equal(E.childPoints(8, 2022, 'M'), 1);
  assert.equal(E.childPoints(8, 2022, 'F'), 2);
  assert.equal(E.childPoints(15, 2023, 'F'), 1);
  assert.equal(E.childPoints(15, 2023, 'M'), 0);
  assert.equal(E.childPoints(15, 2024, 'F'), 2);
  assert.equal(E.childPoints(15, 2024, 'M'), 1);
  assert.equal(E.childPoints(18, 2024, 'F'), 0.5);
  assert.equal(E.childPoints(18, 2024, 'M'), 0);
  assert.equal(E.childPoints(19, 2024, 'F'), 0);
  assert.equal(E.childPoints(-1, 2024, 'F'), 0);
});

test('children table 2020-2025 (supplied summary table), full grid', () => {
  const A = { 0: [1.5, 1.5, 2.5], 1: [2.5, 2.5, 4.5], 2: [2.5, 2.5, 4.5], 3: [2.5, 2.5, 3.5], 4: [2.5, 2.5, 2.5], 5: [2.5, 2.5, 2.5],
    6: [1, 2, 2], 12: [1, 2, 2], 13: [1, 1, 2], 17: [1, 1, 2], 18: [0.5, 0.5, 0.5] };
  const B = { 0: [1.5, 1.5, 2.5], 1: [2.5, 2.5, 4.5], 2: [2.5, 2.5, 4.5], 3: [2.5, 2.5, 3.5], 4: [2.5, 2.5, 2.5], 5: [2.5, 2.5, 2.5],
    6: [0, 1, 1], 12: [0, 1, 1], 13: [0, 0, 1], 17: [0, 0, 1], 18: [0, 0, 0] };
  const periods = [[2020, 2021], [2022, 2023], [2024, 2025]];
  for (const [t, tbl] of [['A', A], ['B', B]])
    for (const age of Object.keys(tbl))
      periods.forEach((ys, i) => ys.forEach(y => assert.equal(E.childPoints(+age, y, t), tbl[age][i], `table ${t} age ${age} year ${y}`)));
});

test('deferral of birth-year point (table A)', () => {
  assert.equal(E.childPoints(0, 2023, 'A', true), 0.5);
  assert.equal(E.childPoints(1, 2023, 'A', true), 3.5);
  assert.equal(E.childPoints(0, 2024, 'A', true), 1.5);
  assert.equal(E.childPoints(1, 2024, 'A', true), 5.5);
  assert.equal(E.childPoints(2, 2024, 'A', true), 4.5);  // only birth year and age 1 change
  assert.equal(E.childPoints(0, 2024, 'B', true), 2.5);  // table B cannot defer
});

test('single parent gets both tables cumulatively', () => {
  const sp = { gender: 'F', singleParent: true, children: [{ birthYear: 2016 }] };
  // 2024: 2.25 + 0.5 + child age 8 (A 2 + B 1) = 5.75
  const r = E.creditPoints(sp, 2024);
  near(r.items.find(i => i.label === 'ילדים').pts, 3);
  near(r.total, 5.75);
  // lone parent ("חד הורי"): one additional point
  near(E.creditPoints({ gender: 'F', loneParent: true }, 2024).total, 2.25 + 0.5 + 1);
  // childTable override: a man receiving the allowance uses table A
  near(E.creditPoints({ gender: 'M', childTable: 'A', children: [{ birthYear: 2010 }] }, 2023).total, 2.25 + 1);
});

test('new immigrant, arrival from 2022 (54 months)', () => {
  const a = '2022-03';
  near(E.immigrantPoints(a, 2022), 10 / 12);
  near(E.immigrantPoints(a, 2023), 2 / 12 + 2.5);
  near(E.immigrantPoints(a, 2024), 2 + 8 / 12);
  near(E.immigrantPoints(a, 2025), 16 / 12 + 4 / 12);
  near(E.immigrantPoints(a, 2026), 8 / 12);
  const total = [2022, 2023, 2024, 2025, 2026, 2027].reduce((s, y) => s + E.immigrantPoints(a, y), 0);
  near(total, 8.5);                               // 8.5 points over 54 months
});

test('new immigrant, arrival before 2022 (42 months)', () => {
  near(E.immigrantPoints('2020-07', 2020), 1.5);
  near(E.immigrantPoints('2020-07', 2021), 3);
  near(E.immigrantPoints('2020-07', 2022), 2);
  near(E.immigrantPoints('2020-07', 2023), 1);
  near(E.immigrantPoints('2020-07', 2024), 0);
});

test('discharged soldier: 36 months from month after discharge', () => {
  near(E.soldierPoints('2023-06', true, 2023), 1);
  near(E.soldierPoints('2023-06', true, 2024), 2);
  near(E.soldierPoints('2023-06', true, 2026), 1);
  near(E.soldierPoints('2023-06', false, 2024), 1);
  near(E.soldierPoints('2023-12', true, 2023), 0);
  near(E.soldierPoints('', true, 2024), 0);
});

test('credit points profile totals', () => {
  const mom = { gender: 'F', children: [{ birthYear: 2022 }, { birthYear: 2016 }] };
  // 2024: 2.25 + 0.5 + child age 2 (4.5) + child age 8 (2) = 9.25
  near(E.creditPoints(mom, 2024).total, 9.25);
  // 2021: child born 2022 not yet counted; 2.25 + 0.5 + age 5 (2.5) = 5.25
  near(E.creditPoints(mom, 2021).total, 5.25);
  // 2022: 2.25 + 0.5 + age 0 (1.5) + age 6 (1 + temporary-order 1) = 6.25
  near(E.creditPoints(mom, 2022).total, 6.25);
  const dad = { gender: 'M', children: [{ birthYear: 2022 }], soldier: { discharge: '2021-08', full: true } };
  // 2022: 2.25 + age 0 (1.5) + soldier full year 2 = 5.75
  near(E.creditPoints(dad, 2022).total, 5.75);
  assert.equal(E.creditPoints({}, 2024).total, 2.25);
});

test('severance equal split over years ending in payment year', () => {
  assert.deepEqual(E.severanceYears(100000, 2026, 5).map(x => [x.year, x.alloc]),
    [[2022, 20000], [2023, 20000], [2024, 20000], [2025, 20000], [2026, 20000]]);
  const s = E.severanceYears(100001, 2026, 3);
  assert.equal(s.reduce((t, x) => t + x.alloc, 0), 100001);
  assert.equal(E.severanceYears(1000, 2026, 9).length, 6);  // capped at 6
});

test('spread: user example 100,000 in 2026, 20,000 to each of 2021-2025, base 150,000, 2.25 pts', () => {
  const lines = [2021, 2022, 2023, 2024, 2025].map(y => ({ year: y, alloc: 20000, base: 150000, points: 2.25 }));
  const r = E.computeSpread({ total: 100000, payYear: 2026, lines, pay: { base: 150000, points: 2.25 } });
  near(r.sumTax, 20000);                          // every year marginal 20%
  near(r.rate, 0.20, 1e-9);
  near(r.noSpread, (228000 - 150000) * 0.20 + (250000 - 228000) * 0.31);
  assert.deepEqual(E.validate({ total: 100000, payYear: 2026, lines }, 'salary'), []);
});

test('user case: 2025 income 150,000, 8.75 points, 16,000 allocated -> 0 tax', () => {
  const r = E.computeSpread({ total: 16000, payYear: 2026,
    lines: [{ year: 2025, alloc: 16000, base: 150000, points: 8.75 }], pay: { base: 0, points: 2.25 } });
  near(E.grossTax(150000, 2025), 19392);
  near(E.grossTax(166000, 2025), 22592);           // still below 25,410 credit
  near(r.sumTax, 0);
});

test('spread: low-income year absorbs unused credit points', () => {
  const r = E.computeSpread({ total: 30000, payYear: 2026,
    lines: [{ year: 2023, alloc: 30000, base: 0, points: 2.25 }], pay: { base: 300000, points: 2.25 } });
  near(r.sumTax, 0);                              // 3,000 gross tax < 6,345 credit
});

test('spread: allocation crossing brackets is exact difference', () => {
  const r = E.computeSpread({ total: 50000, payYear: 2026,
    lines: [{ year: 2024, alloc: 50000, base: 180000, points: 2.25 }], pay: { base: 0, points: 2.25 } });
  near(r.sumTax, (193800 - 180000) * 0.20 + (230000 - 193800) * 0.31);
});

test('validation catches bad input', () => {
  const v = (lines, type, total = 100) => E.validate({ total, payYear: 2026, lines }, type);
  assert.ok(v([{ year: 2026, alloc: 50, base: 0 }], 'salary').length);                       // sum mismatch
  assert.ok(v([{ year: 2025, alloc: 50, base: 0 }, { year: 2025, alloc: 50, base: 0 }], 'salary').length); // duplicate
  assert.ok(v([{ year: 2019, alloc: 100, base: 0 }], 'salary').length);                      // unsupported year
  assert.ok(v([{ year: 2024, alloc: 100, base: 0 }], 'severance').length);                   // must end in pay year
  assert.ok(v([{ year: 2024, alloc: 50, base: 0 }, { year: 2026, alloc: 50, base: 0 }], 'severance').length); // gap
  assert.ok(v([{ year: 2025, alloc: 70, base: 0 }, { year: 2026, alloc: 30, base: 0 }], 'severance').length); // unequal
  assert.deepEqual(v([{ year: 2025, alloc: 50, base: 0 }, { year: 2026, alloc: 50, base: 0 }], 'severance'), []);
});

test('current-year certificate: forced credit = payroll tax (no spread) - spread tax', () => {
  const lines = [2021, 2022, 2023, 2024, 2025].map(y => ({ year: y, alloc: 20000, base: 150000, points: 2.25 }));
  const r = E.computeSpread({ total: 100000, payYear: 2026, lines, pay: { base: 150000, points: 2.25 } });
  near(r.noSpread, 22420);          // payroll: 100,000 on top of 150,000 in 2026
  near(r.sumTax, 20000);
  near(r.forcedCredit, 2420);
});

test('refund report: prior-year share removed from report-year income and withheld tax', () => {
  const lines = [{ year: 2024, alloc: 30000, base: 100000, points: 2.25 }, { year: 2025, alloc: 30000, base: 100000, points: 2.25 },
    { year: 2026, alloc: 30000, base: 200000, points: 2.25 }];
  const r = E.computeSpread({ total: 90000, payYear: 2026, lines, pay: { base: 200000, points: 2.25 } });
  const a = E.refundAdjust(r, 2026, 290000, 60000);
  assert.equal(a.prevIncome, 60000);
  near(a.prevTax, r.lines[0].add + r.lines[1].add);
  assert.equal(a.income, 230000);
  near(a.tax, 60000 - a.prevTax);
  assert.equal(E.refundAdjust(r, 2026, null, null).income, null);
});
