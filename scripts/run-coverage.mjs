// Executes the three coverage layers with one source-mapped build and restores the ordinary
// production artifact before returning. The merge script owns source normalization, inventory
// checks and the 0.0.1 quality floor.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MODULE_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(MODULE_PATH), "..");
const COVERAGE = path.join(ROOT, "coverage");

function run(script, args, extraEnv = {}) {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === null) delete env[key];
    else env[key] = value;
  }
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    const error = new Error(`${path.relative(ROOT, script)} exited with status ${result.status ?? 1}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

export function runWithRestoredArtifact(coverageWork, restoreArtifact) {
  let coverageFailure = null;
  try {
    coverageWork();
  } catch (error) {
    coverageFailure = error;
  }
  try {
    restoreArtifact();
  } catch (restoreFailure) {
    if (coverageFailure) {
      throw new AggregateError([coverageFailure, restoreFailure], "coverage failed and the ordinary bundle could not be restored");
    }
    throw restoreFailure;
  }
  if (coverageFailure) throw coverageFailure;
}

function main() {
  if (path.dirname(COVERAGE) !== ROOT || path.basename(COVERAGE) !== "coverage") {
    throw new Error(`refusing to clear unexpected coverage path ${COVERAGE}`);
  }
  fs.rmSync(COVERAGE, { recursive: true, force: true });

  const rollup = path.join(ROOT, "node_modules", "rollup", "dist", "bin", "rollup");
  const c8 = path.join(ROOT, "node_modules", "c8", "bin", "c8.js");
  const playwright = path.join(ROOT, "node_modules", "@playwright", "test", "cli.js");
  const merge = path.join(ROOT, "scripts", "merge-coverage.mjs");

  runWithRestoredArtifact(
    () => {
      run(rollup, ["-c"], { VACUUM_ORCHESTRATOR_CARD_COVERAGE: "1" });

      const c8Args = (directory, tests, includes = ["src/**/*.js"]) => [
        "--report-dir", directory,
        "--reporter=json",
        "--all",
        ...includes.map((pattern) => `--include=${pattern}`),
        process.execPath,
        "--test",
        ...tests,
      ];
      // Two Node layers by how they reach the code: the source-direct suites and the ones that
      // drive the built bundle. Leaving a suite out of both would understate what is covered.
      // The contract layer is not among them: it describes the release artifact, which this
      // run deliberately builds with a source map.
      run(c8, c8Args("coverage/raw-unit", ["test/unit/**/*.test.js", "test/property/**/*.test.js", "test/architecture/**/*.test.js"]));
      // The bundle-loading suites execute dist/, which V8 records under that filename; without
      // it in the include list c8 discards their coverage and the layer reports nothing. The
      // build under this flag carries a source map, so the report lands back on src/.
      run(c8, c8Args("coverage/raw-bundle", ["test/component/**/*.test.js", "test/characterization/**/*.test.js"], ["src/**/*.js", "dist/vacuum-orchestrator-card.js"]));

      run(playwright, ["test", "--project=chromium"], {
        VACUUM_ORCHESTRATOR_CARD_BROWSER_COVERAGE: "1",
        VACUUM_ORCHESTRATOR_CARD_BROWSER_COVERAGE_DIR: path.join(COVERAGE, "browser", "raw"),
      });
      run(merge, []);
    },
    () => run(rollup, ["-c"], { VACUUM_ORCHESTRATOR_CARD_COVERAGE: null }),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  try {
    main();
  } catch (error) {
    console.error(`Coverage runner failed: ${error.message}`);
    const failures = error instanceof AggregateError ? error.errors : [error];
    process.exitCode = failures.find((failure) => Number.isInteger(failure?.exitCode))?.exitCode ?? 1;
  }
}
