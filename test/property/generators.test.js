"use strict";
// Generator and shrinking diagnostics remain reproducible across runs.

const test = require("node:test");
const assert = require("node:assert/strict");
const { seedOf, seededRandom } = require("./seeded-random.js");
const { checkGenerated } = require("./check.js");

test("equal seeds produce equal populations and distinct seeds change them", () => {
  const first = seededRandom(seedOf("fixture"));
  const second = seededRandom(seedOf("fixture"));
  const third = seededRandom(seedOf("other"));
  assert.deepEqual(Array.from({ length: 32 }, () => first.next()), Array.from({ length: 32 }, () => second.next()));
  assert.notDeepEqual(Array.from({ length: 8 }, () => first.next()), Array.from({ length: 8 }, () => third.next()));
});

test("a failure reports its seed, case and smaller counterexample", () => {
  assert.throws(() => checkGenerated({
    name: "sample",
    cases: 1,
    seed: 7,
    generate: () => ({ values: [1, 2, 3] }),
    verify: ({ values }) => assert.equal(values.length, 0),
    shrink: ({ values }) => values.length > 1 ? [{ values: values.slice(0, -1) }] : [],
  }), /seed=7, case=0.*minimal=\{"values":\[1\]\}/);
});
