"use strict";

const { seedOf } = require("./seeded-random.js");

function propertyRun(kind, defaultCases, defaultSeed) {
  const key = `VACUUM_ORCHESTRATOR_CARD_${kind}`;
  const rawCount = process.env[`${key}_CASES`];
  const cases = rawCount === undefined ? defaultCases : Number(rawCount);
  if (!Number.isSafeInteger(cases) || cases < 1 || cases > 100_000) {
    throw new RangeError(`${key}_CASES must be an integer from 1 to 100000`);
  }
  const rawSeed = process.env[`${key}_SEED`] ?? defaultSeed;
  if (String(rawSeed).length > 128) throw new RangeError(`${key}_SEED is too long`);
  return Object.freeze({ cases, seed: seedOf(rawSeed), seedText: String(rawSeed) });
}

module.exports = { propertyRun };
