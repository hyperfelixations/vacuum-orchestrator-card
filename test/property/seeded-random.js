"use strict";

function seedOf(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  }
  return Object.freeze({
    next,
    integer: (limit) => {
      if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
      return next() % limit;
    },
    pick: (values) => {
      if (!Array.isArray(values) || values.length === 0) throw new RangeError("pick needs values");
      return values[next() % values.length];
    },
    boolean: () => (next() & 1) === 1,
  });
}

module.exports = { seedOf, seededRandom };
