"use strict";

const { seededRandom } = require("./seeded-random.js");

function fails(verify, candidate) {
  try {
    verify(candidate);
    return false;
  } catch {
    return true;
  }
}

function checkGenerated({ name, cases, seed, generate, verify, classify = () => "case", shrink = () => [] }) {
  const random = seededRandom(seed);
  const census = new Map();
  for (let index = 0; index < cases; index += 1) {
    const sample = generate(random, index);
    const label = classify(sample);
    census.set(label, (census.get(label) || 0) + 1);
    try {
      verify(sample);
    } catch (cause) {
      let minimal = sample;
      for (let step = 0; step < 64; step += 1) {
        const smaller = shrink(minimal).find((candidate) => fails(verify, candidate));
        if (smaller === undefined || JSON.stringify(smaller) === JSON.stringify(minimal)) break;
        minimal = smaller;
      }
      throw new Error(`${name} failed (seed=${seed}, case=${index}, class=${label}, minimal=${JSON.stringify(minimal)})`, { cause });
    }
  }
  return Object.freeze(Object.fromEntries(census));
}

module.exports = { checkGenerated };
