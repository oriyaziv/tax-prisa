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
  // 2024: 2.25 + 0.5 + child age 8 (A 2 + B 1) + sole-parent point 1 = 6.75
  const r = E.creditPoints(sp, 2024);
  near(r.items.find(i => i.label === 'ילדים').pts, 3);
  near(r.total, 6.75);
  // both boxes ticked -> still one extra point
  near(E.creditPoints(Object.assign({ loneParent: true }, sp), 2024).total, 6.75);
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

test('severance shares of years before 2020 stay in the payment year', () => {
  // received 2021, 4 years -> 2018,2019 not supported -> added to 2021
  const s = E.severanceYears(100000, 2021, 4);
  assert.deepEqual(s.map(x => [x.year, x.alloc]), [[2020, 25000], [2021, 75000]]);
  const lines = s.map(x => ({ year: x.year, alloc: x.alloc, base: 0 }));
  assert.deepEqual(E.validate({ total: 100000, payYear: 2021, lines }, 'severance'), []);
  // payment year below the equal share is still an error
  assert.ok(E.validate({ total: 100000, payYear: 2021, lines: [{ year: 2020, alloc: 70000, base: 0 }, { year: 2021, alloc: 30000, base: 0 }] }, 'severance').length);
});

test('shekel credits: qualifying town (fixed, proportional to months)', () => {
  near(E.shekelCredits(2025, 150000, { settleRate: 12, settleCeil: 213240 }).total, 18000);
  near(E.shekelCredits(2025, 300000, { settleRate: 12, settleCeil: 213240 }).total, 25588.8);  // capped at ceiling
  near(E.shekelCredits(2025, 150000, { settleRate: 12, settleCeil: 213240, settleMonths: 6 }).total, 9000);
});

test('shekel credits: Eilat 10% up to ceiling', () => {
  near(E.shekelCredits(2023, 0, { eilatIncome: 100000 }).total, 10000);
  near(E.shekelCredits(2023, 0, { eilatIncome: 400000 }).total, 25980);
  near(E.shekelCredits(2020, 0, { eilatIncome: 400000 }).total, 24252);
});

test('shekel credits: pension 35%, life 25%', () => {
  near(E.shekelCredits(2024, 150000, { pension: 9000, life: 1000 }).total, 3150 + 250);
});

test('shekel credits: donations minimum and 30% cap', () => {
  near(E.shekelCredits(2024, 100000, { donation: 1000 }).total, 350);
  near(E.shekelCredits(2024, 100000, { donation: 200 }).total, 0);        // not above 207
  near(E.shekelCredits(2024, 10000, { donation: 5000 }).total, 0.35 * 3000);  // 30% of income
});

test('shekel credits: shift work 15%, ceiling and max', () => {
  // 2024: ceiling 143,040, max 12,540. Salary 100,000 incl. 30,000 shift -> all eligible -> 4,500
  near(E.shekelCredits(2024, 100000, { shiftWage: 30000 }).total, 4500);
  // salary 160,000 incl. 30,000 shift: other 130,000 -> eligible 13,040 -> 1,956
  near(E.shekelCredits(2024, 160000, { shiftWage: 30000 }).total, 1956);
  // big shift wage hits max credit
  near(E.shekelCredits(2024, 100000, { shiftWage: 100000 }).total, 12540);
  // 2020: ceiling 129,120, max 11,340
  near(E.shekelCredits(2020, 100000, { shiftWage: 100000 }).total, 11340);
  near(E.shekelCredits(2021, 140000, { shiftWage: 30000 }).total, 0.15 * (128400 - 110000));
});

test('shekel credits feed the spread as fixed credits', () => {
  const cr = E.shekelCredits(2025, 150000, { settleRate: 12, settleCeil: 213240 }).total;  // 18,000
  const r = E.computeSpread({ total: 20000, payYear: 2026,
    lines: [{ year: 2025, alloc: 20000, base: 150000, points: 2.25, extraCredit: cr }], pay: { base: 0, points: 2.25 } });
  // gross 150,000 = 19,392; credits 6,534 + 18,000 > gross -> t0 0; gross 170,000 = 23,392 -> t1 = 23,392 - 24,534 < 0 -> 0
  near(r.sumTax, 0);
});

test('donation minimum 2020-2021 is 190', () => {
  near(E.shekelCredits(2020, 100000, { donation: 180 }).total, 0);
  near(E.shekelCredits(2021, 100000, { donation: 1000 }).total, 350);
});

test('special-salary soldier: 5% up to ceiling, better of soldier / qualifying town', () => {
  near(E.shekelCredits(2024, 200000, { soldierSalary: 200000 }).total, 0.05 * 178320);
  near(E.shekelCredits(2020, 200000, { soldierSalary: 200000 }).total, 8028);   // 5% x 160,560
  near(E.shekelCredits(2021, 200000, { soldierSalary: 200000 }).total, 8004);   // 5% x 160,080
  near(E.shekelCredits(2026, 200000, { soldierSalary: 200000 }).total, 8916);   // 5% x 178,320
  // town 7% x 146,642 = 10,264.94 > soldier 8,916 -> town kept
  const a = E.shekelCredits(2024, 200000, { soldierSalary: 200000, settleRate: 7, settleCeil: 146642 });
  near(a.total, 10264.94); assert.equal(a.items.length, 1);
  // town 3% x 100,000 = 3,000 < soldier 8,916 -> soldier kept
  const b = E.shekelCredits(2024, 200000, { soldierSalary: 200000, settleRate: 3, settleCeil: 100000 });
  near(b.total, 8916); assert.equal(b.items.length, 1);
});

test('reserve combat points (2026+, by days in previous year)', () => {
  assert.equal(E.reservePoints(29, 2026), 0);
  assert.equal(E.reservePoints(30, 2026), 0.5);
  assert.equal(E.reservePoints(45, 2026), 0.75);
  assert.equal(E.reservePoints(50, 2026), 1);
  assert.equal(E.reservePoints(64, 2026), 1.5);
  assert.equal(E.reservePoints(200, 2026), 4);
  assert.equal(E.reservePoints(80, 2025), 0);
  near(E.creditPoints({ reserveDays: { 2025: 60 } }, 2026).total, 2.25 + 1.5);
  near(E.creditPoints({ reserveDays: { 2025: 60 } }, 2025).total, 2.25);
});

test('alimony to former spouse: 1 point from year of remarriage', () => {
  near(E.creditPoints({ alimonyFrom: 2023 }, 2022).total, 2.25);
  near(E.creditPoints({ alimonyFrom: 2023 }, 2023).total, 3.25);
  near(E.creditPoints({ alimonyFrom: 2023 }, 2026).total, 3.25);
});

test('2026 children table (supplied) matches 2024-2025 rules', () => {
  const A = [2.5, 4.5, 4.5, 3.5, 2.5, 2.5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0.5];
  const B = [2.5, 4.5, 4.5, 3.5, 2.5, 2.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0];
  A.forEach((v, age) => assert.equal(E.childPoints(age, 2026, 'A'), v, 'A age ' + age));
  B.forEach((v, age) => assert.equal(E.childPoints(age, 2026, 'B'), v, 'B age ' + age));
  assert.equal(E.childPoints(0, 2026, 'A', true), 1.5);
  assert.equal(E.childPoints(1, 2026, 'A', true), 5.5);
  assert.ok(!E.creditPoints({ children: [{ birthYear: 2020 }] }, 2026).items.find(i => i.label === 'ילדים').verify);
});

test('degrees and certificates', () => {
  assert.equal(E.degreePoints({ type: 'BA', year: 2021 }, 2022), 1);
  assert.equal(E.degreePoints({ type: 'BA', year: 2021 }, 2023), 0);
  assert.equal(E.degreePoints({ type: 'BA', year: 2021, defer: true }, 2023), 1);
  assert.equal(E.degreePoints({ type: 'BA', year: 2023, studyYears: 4 }, 2026), 1);
  assert.equal(E.degreePoints({ type: 'BA', year: 2023, studyYears: 4 }, 2027), 0);
  // MA 2023+: two years, by years of study
  assert.equal(E.degreePoints({ type: 'MA', year: 2024, studyYears: 2 }, 2026), 0.5);
  assert.equal(E.degreePoints({ type: 'MA', year: 2024, studyYears: 1 }, 2026), 0);
  assert.equal(E.degreePoints({ type: 'MA', year: 2020 }, 2021), 0.5);
  // certificate
  assert.equal(E.degreePoints({ type: 'CERT', year: 2015 }, 2016), 0.5);
  assert.equal(E.degreePoints({ type: 'CERT', year: 2017 }, 2018), 0.75);
  assert.equal(E.degreePoints({ type: 'CERT', year: 2020 }, 2021), 1);
  assert.equal(E.degreePoints({ type: 'CERT', year: 2023, studyYears: 2 }, 2026), 0);
  // internship deferral only when chosen
  assert.equal(E.degreePoints({ type: 'BA', year: 2020, internEnd: 2021 }, 2021), 1);
  assert.equal(E.degreePoints({ type: 'BA', year: 2020, internEnd: 2021, internDefer: true }, 2021), 0);
  assert.equal(E.degreePoints({ type: 'BA', year: 2020, internEnd: 2021, internDefer: true }, 2022), 1);
  // direct doctorate
  assert.equal(E.degreePoints({ type: 'PHD', year: 2023 }, 2024), 0.5);
  assert.equal(E.degreePoints({ type: 'PHD', year: 2023 }, 2025), 0.5);
  assert.equal(E.degreePoints({ type: 'PHD', year: 2023 }, 2026), 0);
  assert.equal(E.degreePoints({ type: 'PHD', year: 2020 }, 2021), 0.5);
  assert.equal(E.degreePoints({ type: 'PHD', year: 2020 }, 2022), 0);
  // medicine: 2023+ 1 x3 then 0.5 x2; 2014-2022 1 then 0.5
  assert.deepEqual([2024, 2025, 2026, 2027, 2028, 2029].map(y => E.degreePoints({ type: 'MED', year: 2023 }, y)), [1, 1, 1, 0.5, 0.5, 0]);
  assert.deepEqual([2021, 2022, 2023].map(y => E.degreePoints({ type: 'MED', year: 2020 }, y)), [1, 0.5, 0]);
  assert.equal(E.degreePoints({ type: 'BA', year: 2012 }, 2013), 0);
});

test('education combination rules', () => {
  near(E.creditPoints({ degrees: [{ type: 'BA', year: 2023, studyYears: 3 }, { type: 'MA', year: 2024, studyYears: 2 }] }, 2025).total, 2.25 + 1.5);
  // degrees track: certificate ignored even if larger
  near(E.creditPoints({ degrees: [{ type: 'MA', year: 2024, studyYears: 2 }, { type: 'CERT', year: 2024, studyYears: 2 }] }, 2025).total, 2.25 + 0.5);
  // cert track chosen: degrees ignored
  near(E.creditPoints({ eduTrack: 'cert', degrees: [{ type: 'MA', year: 2024, studyYears: 2 }, { type: 'CERT', year: 2024, studyYears: 2 }] }, 2025).total, 2.25 + 1);
  // only certificate entered -> cert track by default
  near(E.creditPoints({ degrees: [{ type: 'CERT', year: 2020 }] }, 2021).total, 3.25);
  // PhD with BA adds; PhD not on top of MA
  near(E.creditPoints({ degrees: [{ type: 'BA', year: 2019 }, { type: 'PHD', year: 2023 }] }, 2024).total, 2.75);
  near(E.creditPoints({ degrees: [{ type: 'MA', year: 2023, studyYears: 2 }, { type: 'PHD', year: 2023 }] }, 2024).total, 2.75);
  // medicine alone; with BA only half point; with BA+MA none
  near(E.creditPoints({ degrees: [{ type: 'MED', year: 2023 }] }, 2024).total, 3.25);
  near(E.creditPoints({ degrees: [{ type: 'BA', year: 2015 }, { type: 'MED', year: 2023 }] }, 2027).total, 2.75);
  near(E.creditPoints({ degrees: [{ type: 'BA', year: 2015 }, { type: 'MA', year: 2017 }, { type: 'MED', year: 2023 }] }, 2027).total, 2.25);
  near(E.creditPoints({ degrees: [{ type: 'BA', year: 2021 }, { type: 'BA', year: 2021 }] }, 2022).total, 3.25);
});
