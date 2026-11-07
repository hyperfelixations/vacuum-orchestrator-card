"use strict";
// Supply-chain gates: no dependency is pinned past its fixes, every advisory against a runtime
// dependency and every package without a registry signature stops CI and the release, and every
// action runs from a reviewed commit that Dependabot keeps current. Advisories against build and
// test tooling do not gate, since none of that code ships; CI reports them (SEC-07). See internal
// dev doc §4 "Abhängigkeits-Sicherheit".
// Boundary: the files are read as text; whether an advisory exists is npm audit's verdict in CI.

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8").replace(/\r\n/g, "\n");
const pkg = JSON.parse(read("package.json"));
const WORKFLOWS = fs.readdirSync(path.join(ROOT, ".github", "workflows")).filter((name) => name.endsWith(".yml"));
// Composite actions of this repository, used as `./.github/actions/<name>`.
const ACTIONS = fs.readdirSync(path.join(ROOT, ".github", "actions"));

// An override may only raise an installed transitive package to a minimum within its major;
// an exact pin would hold it on a vulnerable version after the fix ships.
test("overrides only set a caret minimum for packages in the lockfile", () => {
  const installed = new Set(Object.keys(JSON.parse(read("package-lock.json")).packages)
    .map((key) => key.split("node_modules/").pop()));
  const walk = (overrides, trail) => {
    for (const [name, value] of Object.entries(overrides)) {
      const where = [...trail, name].join(" > ");
      assert.ok(installed.has(name), `${where} is not in the lockfile`);
      if (typeof value === "object") walk(value, [...trail, name]);
      else assert.match(value, /^\^\d+\.\d+\.\d+$/, `${where} must be a caret minimum, not ${value}`);
    }
  };
  walk(pkg.overrides ?? {}, []);
  assert.equal(pkg.resolutions, undefined);
});

test("check:security audits runtime at any severity and registry signatures; tooling advisories are reported", () => {
  assert.equal(pkg.scripts["check:security"], "npm audit --omit=dev --audit-level=low && npm audit signatures");
  assert.equal(pkg.scripts["report:advisories"], "node scripts/report-dev-advisories.mjs");
});

// The report comes first, so it shows even when the gating audit stops the job. Neither step may
// fail quietly.
const AUDIT_STEPS = "run: npm ci\n\n      - name: Report advisories against build and test tooling\n        run: npm run report:advisories\n\n      - name: Audit dependencies and registry signatures\n        run: npm run check:security\n";

test("the security workflow audits every push, pull request and week", () => {
  const workflow = read(".github", "workflows", "security.yml");
  assert.match(workflow, /^on:\n  push:\n    branches: \[main\]\n  pull_request:\n    branches: \[main\]\n  schedule:\n    - cron: "[^"]+"\n  workflow_dispatch:/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.ok(workflow.includes(`- ${AUDIT_STEPS}`), "report, then audit, right after npm ci");
  assert.doesNotMatch(workflow, /continue-on-error/);
});

test("a release candidate is audited before it is built", () => {
  const workflow = read(".github", "workflows", "release.yml");
  const job = workflow.match(/\n  build-and-test:\n((?:    .*\n|\n)*)/);
  assert.ok(job, "build-and-test job");
  assert.ok(job[1].includes(AUDIT_STEPS), "report, then audit, right after npm ci");
  assert.ok(job[1].indexOf("check:security") < job[1].indexOf("npm run build"), "audit precedes the build");
  assert.doesNotMatch(workflow, /continue-on-error/);
});

// SEC-07: the report lists tooling advisories by severity and leaves runtime ones to the audit.
const LOCK = { packages: { "": {}, "node_modules/c8": { dev: true }, "node_modules/glob": { dev: true }, "node_modules/left-pad": {}, "node_modules/fsevents": { devOptional: true } } };
const advisory = (name, severity, via, extra = {}) => ({ name, severity, isDirect: false, via, effects: [], range: "*", nodes: [`node_modules/${name}`], fixAvailable: false, ...extra });

test("the tooling report lists each advisory by severity and counts runtime ones apart", async () => {
  const { summarize } = await import("../../scripts/report-dev-advisories.mjs");
  const audit = {
    vulnerabilities: {
      c8: advisory("c8", "moderate", ["glob"], { isDirect: true, fixAvailable: { name: "c8", version: "9.1.0", isSemVerMajor: true } }),
      glob: advisory("glob", "high", [{ title: "Glob | traversal", url: "https://github.com/advisories/GHSA-0000-0000-0000" }], { fixAvailable: true }),
      "left-pad": advisory("left-pad", "low", [{ title: "Runtime", url: "https://github.com/advisories/GHSA-1111-1111-1111" }]),
      fsevents: advisory("fsevents", "low", [{ title: "Optional", url: "https://github.com/advisories/GHSA-2222-2222-2222" }]),
    },
  };
  const { markdown, tooling, runtime } = summarize(audit, LOCK);
  assert.deepEqual([tooling, runtime], [2, 2], "an optional package a runtime one may pull in is not tooling");
  assert.deepEqual(markdown.split("\n").filter((line) => /^\| (?!Package|---)/.test(line)), [
    "| glob | high | [Glob \\| traversal](https://github.com/advisories/GHSA-0000-0000-0000) | `npm audit fix` |",
    "| c8 (direct) | moderate | through glob | c8 9.1.0 (semver-major) |",
  ]);
  assert.match(markdown, /2 packages \(1 high, 1 moderate\)/);
  assert.match(markdown, /2 advisories concern runtime dependencies; `npm run check:security` fails on them\./);
  assert.equal(summarize({ vulnerabilities: {} }, LOCK).markdown, "## Advisories against build and test tooling\n\nnpm audit reports none.\n");
});

test("the tooling report fails only when npm audit gives no report", async () => {
  const { summarize } = await import("../../scripts/report-dev-advisories.mjs");
  assert.throws(() => summarize({ error: { code: "ENOAUDIT", summary: "registry down" } }, LOCK), /no report \(registry down\)/);
  assert.throws(() => summarize(null, LOCK), /no report/);
});

// hacs/action publishes no releases Dependabot could follow; it tracks main and is confined to
// jobs without permissions, where it reaches neither the repository nor its secrets. A composite
// action of this repository is reviewed with it and pins its own actions the same way.
const PINNED = /uses: [\w.-]+\/[\w.\/-]+@[0-9a-f]{40} # [\w.-]+$/;
const usesLines = (text) => text.split("\n").filter((entry) => /^\s*(?:- )?uses:/.test(entry));

test("every action is pinned to a full commit SHA, except hacs/action@main without permissions", () => {
  for (const name of WORKFLOWS) {
    const workflow = read(".github", "workflows", name);
    const unprivileged = /^permissions: \{\}$/m.test(workflow);
    for (const [, job, body] of workflow.matchAll(/^  ([\w-]+):\n((?:    .*\n|\n)*)/gm)) {
      for (const line of usesLines(body)) {
        const local = line.match(/uses: \.\/\.github\/actions\/([\w-]+)$/);
        if (local) {
          assert.ok(ACTIONS.includes(local[1]), `${name} ${job}: ${line.trim()}`);
        } else if (/uses: hacs\/action@main$/.test(line)) {
          assert.ok(unprivileged || /^    permissions: \{\}$/m.test(body), `${name} ${job}: hacs/action needs permissions: {}`);
        } else {
          assert.match(line, PINNED, `${name} ${job}: ${line.trim()}`);
        }
      }
    }
  }
  for (const action of ACTIONS) {
    const lines = usesLines(read(".github", "actions", action, "action.yml"));
    assert.ok(lines.length, action);
    for (const line of lines) assert.match(line, PINNED, `${action}: ${line.trim()}`);
  }
});

// The project has no YAML parser: dependabot.yml is read as text, one block per `updates` entry
// (without the comment lines that introduce the next one), and each block is compared with the
// exact text of its contract.
const dependabotBlocks = () => {
  const blocks = read(".github", "dependabot.yml").split(/\n(?=  - package-ecosystem: )/).slice(1);
  return Object.fromEntries(blocks.map((block) => [block.match(/^  - package-ecosystem: (\S+)/)[1], `${block.replace(/(?:\n\s*(?:#.*)?)+$/, "")}\n`]));
};
const SCHEDULE = '    schedule:\n      interval: cron\n      cronjob: "0 5 1,15 * *"\n';
const COOLDOWN = "    cooldown:\n      default-days: 7\n";
const PATCH_IGNORE = '    ignore:\n      - dependency-name: "*"\n        update-types: ["version-update:semver-patch"]\n';
const VERSION_GROUP = '        update-types: ["minor", "patch"]\n        applies-to: version-updates\n';
const SECURITY_GROUP = '      security:\n        patterns: ["*"]\n        applies-to: security-updates\n';
const GROUPS = {
  npm: `    groups:\n      tooling:\n        dependency-type: development\n${VERSION_GROUP}${SECURITY_GROUP}`,
  "github-actions": `    groups:\n      actions:\n        patterns: ["*"]\n${VERSION_GROUP}${SECURITY_GROUP}`,
};

test("Dependabot watches npm in the repository root and the workflows with their composite actions", () => {
  const blocks = dependabotBlocks();
  assert.deepEqual(Object.keys(blocks).sort(), ["github-actions", "npm"]);
  assert.match(blocks.npm, /\n    directory: \/\n/);
  assert.match(blocks["github-actions"], /\n    directories:\n      - \/\n      - \/\.github\/actions\/\*\n/);
});

// Dependabot only reads the manifests of watched directories; an unwatched one is never updated.
test("the root package.json is the only tracked manifest with dependencies", () => {
  const tracked = execFileSync("git", ["ls-files", "--", "*package.json"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  assert.ok(tracked.includes("package.json"));
  for (const file of tracked.filter((candidate) => candidate !== "package.json")) {
    const manifest = JSON.parse(read(file));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) assert.equal(manifest[field], undefined, `${file} ${field}`);
  }
});

test("version updates run on the 1st and 15th, wait a week after a release and skip patch releases", () => {
  for (const [ecosystem, block] of Object.entries(dependabotBlocks())) {
    assert.ok(block.includes(SCHEDULE), `${ecosystem} schedule`);
    assert.ok(block.includes(COOLDOWN), `${ecosystem} cooldown`);
    assert.ok(block.includes(PATCH_IGNORE), `${ecosystem} patch rule`);
    assert.equal(block.match(/dependency-name:/g).length, 1, `${ecosystem} has one ignore rule`);
  }
});

test("minor updates are grouped, majors stay single pull requests and security updates come grouped", () => {
  for (const [ecosystem, block] of Object.entries(dependabotBlocks())) assert.ok(block.endsWith(GROUPS[ecosystem]), `${ecosystem} groups`);
});

// A rule that names only a package would block its security updates as well.
test("no ignore rule can hold back security updates", () => {
  for (const [ecosystem, block] of Object.entries(dependabotBlocks())) {
    const lines = block.split("\n");
    assert.ok(lines.some((line) => line.includes("dependency-name:")), `${ecosystem} has an ignore rule`);
    lines.forEach((line, index) => {
      if (line.includes("dependency-name:")) assert.match(lines[index + 1], /^\s+update-types:/, ecosystem);
    });
  }
});
