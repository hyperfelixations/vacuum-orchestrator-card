"use strict";
// The property families and how a run of one is shaped: each test passes its own default count and
// seed; `VACUUM_ORCHESTRATOR_CARD_<FAMILY>_CASES` and `_SEED` override them. The release sweep, the
// coverage runs and the workflow check read this one list (internal dev doc §10).

const { seedOf } = require("./seeded-random.js");

// `releaseCases`: the count `.github/workflows/release.yml` runs every test of the family with.
const PROPERTY_FAMILIES = Object.freeze({
  INVARIANTS: Object.freeze({ releaseCases: 2500 }),
  EVENTS: Object.freeze({ releaseCases: 500 }),
  BACKEND_UI: Object.freeze({ releaseCases: 2500 }),
  METAMORPHIC: Object.freeze({ releaseCases: 1200 }),
});

const keyOf = (kind) => `VACUUM_ORCHESTRATOR_CARD_${kind}`;

// Every environment variable that shapes a property run.
function propertyEnvKeys() {
  return Object.keys(PROPERTY_FAMILIES).flatMap((kind) => [`${keyOf(kind)}_CASES`, `${keyOf(kind)}_SEED`]);
}

function propertyRun(kind, defaultCases, defaultSeed) {
  if (!Object.hasOwn(PROPERTY_FAMILIES, kind)) throw new RangeError(`${kind} is not a property family`);
  const key = keyOf(kind);
  const rawCount = process.env[`${key}_CASES`];
  const cases = rawCount === undefined ? defaultCases : Number(rawCount);
  if (!Number.isSafeInteger(cases) || cases < 1 || cases > 100_000) {
    throw new RangeError(`${key}_CASES must be an integer from 1 to 100000`);
  }
  const rawSeed = process.env[`${key}_SEED`] ?? defaultSeed;
  if (String(rawSeed).length > 128) throw new RangeError(`${key}_SEED is too long`);
  return Object.freeze({ cases, seed: seedOf(rawSeed), seedText: String(rawSeed) });
}

module.exports = { PROPERTY_FAMILIES, propertyEnvKeys, propertyRun };
