// The measuring tool for view switches (`npm run perf`): its options and the median it reports.
// The measurement itself drives a browser and is not a test (internal dev doc §5 "Reiterwechsel").

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../scripts/measure-performance.mjs");

test("the measuring tool reads its options and refuses unknown or empty ones", async () => {
  const { parseArguments } = await load();
  assert.deepEqual(parseArguments([]), { rate: 4, width: 380, rounds: 5, language: "de" });
  assert.deepEqual(parseArguments(["--rate", "6", "--width", "320", "--rounds", "3", "--language", "en"]), { rate: 6, width: 320, rounds: 3, language: "en" });
  assert.throws(() => parseArguments(["--speed", "2"]), /unknown option --speed/);
  assert.throws(() => parseArguments(["--rounds", "0"]), /--rounds needs a positive number/);
});

test("the median of an odd and an even count, and of none", async () => {
  const { median } = await load();
  assert.deepEqual([median([3, 1, 2]), median([4, 1, 3, 2]), median([])], [2, 2.5, null]);
});
