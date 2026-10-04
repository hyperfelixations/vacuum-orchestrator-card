"use strict";
// Release candidates use one approved commit and one tested bundle. The GitHub draft is the
// only write operation, and it depends on the complete test and HACS gates. The approved commit
// is any commit in the history of main; the HACS gate applies once a stable release exists.
// The validation script runs here against throwaway git repositories (pwsh or powershell).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const file = path.join(__dirname, "..", "..", ".github", "workflows", "release.yml");
const workflow = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function versionPattern(kind) {
  const branch = workflow.match(new RegExp(`"${kind}" \\{\\s*if \\(\\$version -cnotmatch '([^']+)'\\)`));
  assert.ok(branch, `${kind} must have a case-sensitive version guard`);
  assert.doesNotMatch(branch[1], /\\d/, "version digits must be ASCII-only");
  return new RegExp(branch[1]);
}

test("release starts manually and never reacts to publication", () => {
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow, /types:\s*\[published\]|on:\n  release:/);
  for (const name of ["version", "expected_sha", "release_kind"]) {
    assert.match(workflow, new RegExp(`^      ${name}:`, "m"));
  }
  assert.match(workflow, /group: release-candidate\n  cancel-in-progress: false/);
});

test("owner, main, approved SHA and immutable tag are checked before build", () => {
  for (const fragment of [
    'TRIGGERING_ACTOR -ne $env:REPOSITORY_OWNER',
    'SELECTED_REF -ne "refs/heads/main"',
    "'^[0-9a-f]{40}$'",
    'git cat-file -e "$expectedSha^{commit}"',
    'git merge-base --is-ancestor $expectedSha $actualSha',
    'git tag --list $tag',
    'repos/$GITHUB_REPOSITORY/git/ref/tags/$RELEASE_TAG',
  ]) assert.ok(workflow.includes(fragment), fragment);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /persist-credentials: false/);
});

test("stable and dev versions use the RCC version contract", () => {
  const stable = versionPattern("stable");
  const dev = versionPattern("dev");
  for (const value of ["0.0.1", "12.34.56"]) assert.match(value, stable);
  for (const value of ["0.0.2-dev.1", "12.34.56-dev.10"]) assert.match(value, dev);
  for (const value of ["v0.0.1", "01.0.1", "0.0.1-dev.1", "0.0.1+build", "０.0.1"]) assert.doesNotMatch(value, stable);
  for (const value of ["0.0.2-dev.0", "0.0.2-dev.01", "0.0.2-DEV.1", "0.0.2-beta.1"]) assert.doesNotMatch(value, dev);
  assert.match(workflow, /args\+=\(--prerelease --latest=false\)/);
});

test("browser and draft consume the same checked candidate bundle", () => {
  assert.match(workflow, /browser-tests:\n(?:.|\n)*?needs: build-and-test/);
  assert.match(workflow, /create-draft:\n(?:.|\n)*?needs:\n      - build-and-test\n      - browser-tests\n      - hacs-validation/);
  assert.match(workflow, /hacs-validation:\n(?:.|\n)*?uses: hacs\/action@main\n        with:\n          category: plugin/);
  assert.match(workflow, /path: dist\/vacuum-orchestrator-card\.js/);
  assert.match(workflow, /EXPECTED_SHA256: \$\{\{ needs\.build-and-test\.outputs\.artifact_sha256 \}\}/);
  assert.match(workflow, /npm run test:browser:run -- --retries=0/);
  assert.match(workflow, /gh release create "\$RELEASE_TAG"[\s\S]*?--draft[\s\S]*?--target "\$EXPECTED_SHA"/);
  assert.doesNotMatch(workflow, /gh release edit.*--draft=false|gh release upload|softprops\/action-gh-release/);
});

// ------------------------------------------------------------------ approved commit --

function jobBlock(name, source = workflow) {
  const match = source.match(new RegExp(`\\n  ${name}:\\n((?:    .*\\n|\\n)*)`));
  assert.ok(match, `the workflow declares job ${name}`);
  return match[1];
}

// The `run: |` script of one named step, dedented to what the shell receives.
function stepScript(job, stepName) {
  const start = job.indexOf(`      - name: ${stepName}\n`);
  assert.notEqual(start, -1, `step "${stepName}" exists`);
  const rest = job.slice(start + 1);
  const end = rest.search(/\n {6}- name:/);
  const step = end === -1 ? rest : rest.slice(0, end);
  const run = step.match(/^ {8}run: \|\n((?: {10}.*\n?|\n)+)/m);
  assert.ok(run, `step "${stepName}" runs a script`);
  return run[1].split("\n").map((line) => line.slice(10)).join("\n");
}

const VALIDATION_STEP = "Validate branch, SHA, version and HACS contract";

function stepNames(job) {
  return [...job.matchAll(/^ {6}- name: (.+)$/gm)].map((match) => match[1]);
}

test("any commit in the history of main can be approved, and no other", () => {
  const script = stepScript(jobBlock("build-and-test"), VALIDATION_STEP);
  assert.doesNotMatch(script, /\$expectedSha -ne \$actualSha/, "the tip of main is no longer the only approvable commit");
  assert.ok(script.includes('git cat-file -e "$expectedSha^{commit}"'));
  assert.ok(script.includes("git merge-base --is-ancestor $expectedSha $actualSha"));
});

test("the candidate is built and tested from the approved commit in every job", () => {
  const build = jobBlock("build-and-test");
  const names = stepNames(build);
  const order = [VALIDATION_STEP, "Check out the approved commit", "Set up Node.js", "Install exactly from the lockfile",
    "Audit dependencies and registry signatures", "Validate version files and HACS manifest", "Build the release asset from src/"];
  const positions = order.map((name) => names.indexOf(name));
  assert.ok(positions.every((position) => position !== -1), `steps missing: ${order.filter((name, i) => positions[i] === -1).join(", ")}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "validate, switch to the approved commit, then install, audit and build");
  assert.match(stepScript(build, "Check out the approved commit"), /git checkout --detach/);
  assert.match(build, /release_sha: \$\{\{ steps\.release-metadata\.outputs\.sha \}\}/);
  assert.match(jobBlock("browser-tests"), /uses: actions\/checkout@[0-9a-f]{40} # [\w.-]+\n {8}with:\n {10}ref: \$\{\{ needs\.build-and-test\.outputs\.release_sha \}\}/);
  assert.match(jobBlock("create-draft"), /EXPECTED_SHA: \$\{\{ needs\.build-and-test\.outputs\.release_sha \}\}/);
  assert.doesNotMatch(workflow, /EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}\n {6}EXPECTED_SHA256/);
});

// ------------------------------------------------------------------------- HACS gate --

test("the HACS gate runs once a stable release is published and never weakens the dependencies of the draft", () => {
  const state = jobBlock("release-state");
  assert.match(state, /\n {4}permissions:\n {6}contents: read\n/);
  assert.match(state, /gh api --paginate/);
  assert.match(state, /select\(\.draft == false and \.prerelease == false\)/);
  assert.match(state, /stable_release_exists: \$\{\{ steps\.state\.outputs\.stable_release_exists \}\}/);

  const hacs = jobBlock("hacs-validation");
  assert.match(hacs, /\n {4}needs: release-state\n/);
  assert.match(hacs, /^ {4}permissions: \{\}$/m, "hacs/action stays in a job without permissions");
  assert.match(
    hacs,
    /- name: HACS validation\n {8}if: needs\.release-state\.outputs\.stable_release_exists != 'false'\n {8}uses: hacs\/action@main\n {8}with:\n {10}category: plugin\n/,
    "fail-closed: only an explicit 'false' skips the validation"
  );
  assert.match(hacs, /if: needs\.release-state\.outputs\.stable_release_exists == 'false'/);
  assert.doesNotMatch(workflow, /\balways\(\)|continue-on-error/, "no construct that lets a failed gate through");
  assert.match(
    jobBlock("create-draft"),
    /needs:\n {6}- build-and-test\n {6}- browser-tests\n {6}- hacs-validation\n/
  );
});

// ----------------------------------------------------- executable validation script --

function findPowerShell() {
  for (const candidate of ["pwsh", "powershell"]) {
    const probe = spawnSync(candidate, ["-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.Major"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const POWERSHELL = findPowerShell();
const NO_POWERSHELL = POWERSHELL ? false : "SKIP: neither pwsh nor powershell is installed; the release workflow runs this script on windows-latest";

const scratch = [];
test.after(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

function scratchDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", `core.hooksPath=${scratchDir("no-hooks-")}`, "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

// main: one -> two (v2.38.0, v2.39.0) -> three -> four; side branches off two.
function createHistory(extraTags = {}) {
  const dir = scratchDir("release-history-");
  git(dir, "init", "-q", "-b", "main");
  const commit = (message) => {
    fs.writeFileSync(path.join(dir, "file.txt"), message);
    git(dir, "add", "file.txt");
    git(dir, "commit", "-q", "-m", message);
    return git(dir, "rev-parse", "HEAD");
  };
  const one = commit("one");
  git(dir, "tag", "v2.38.0");
  const two = commit("two");
  git(dir, "tag", "v2.39.0");
  git(dir, "tag", "v2.40.0-dev.1");
  git(dir, "checkout", "-q", "-b", "side");
  const side = commit("side");
  git(dir, "checkout", "-q", "main");
  const three = commit("three");
  const four = commit("four");
  const commits = { one, two, three, four, side };
  for (const [tag, target] of Object.entries(extraTags)) git(dir, "tag", tag, commits[target]);
  return { dir, ...commits };
}

const VALIDATION_SCRIPT = stepScript(jobBlock("build-and-test"), VALIDATION_STEP);

function runPowerShell(script, cwd, env) {
  const work = scratchDir("release-run-");
  const file = path.join(work, "step.ps1");
  const output = path.join(work, "github-output.txt");
  fs.writeFileSync(file, script);
  const result = spawnSync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env, GITHUB_OUTPUT: output },
  });
  const outputs = fs.existsSync(output) ? fs.readFileSync(output, "utf8").trim().split(/\r?\n/).filter(Boolean) : [];
  return { status: result.status, failure: `${result.stderr}${result.stdout}`, outputs };
}

function validate(history, { expected, version, kind = "stable", actor = "owner", ref = "refs/heads/main" }) {
  return runPowerShell(VALIDATION_SCRIPT, history.dir, {
    ACTUAL_SHA: history.four,
    EXPECTED_SHA: expected,
    RELEASE_KIND: kind,
    RELEASE_VERSION: version,
    REPOSITORY_OWNER: "owner",
    SELECTED_REF: ref,
    TRIGGERING_ACTOR: actor,
  });
}

function assertAccepted(result) {
  assert.equal(result.status, 0, result.failure);
}

function assertRefused(result, reason) {
  assert.notEqual(result.status, 0, "the validation must refuse");
  assert.match(result.failure, reason);
  assert.deepEqual(result.outputs, [], "a refused candidate publishes no outputs");
}

test("the tip of main is approved and its normalized SHA is published", { skip: NO_POWERSHELL }, () => {
  const history = createHistory();
  const result = validate(history, { expected: `  ${history.four.toUpperCase()}  `, version: "2.41.0" });
  assertAccepted(result);
  assert.deepEqual(result.outputs, ["tag=v2.41.0", "title=Vacuum Orchestrator Card 2.41.0", `sha=${history.four}`]);
});

test("an older commit of main is approved, including one that carries an earlier release", { skip: NO_POWERSHELL }, () => {
  const history = createHistory();
  assertAccepted(validate(history, { expected: history.three, version: "2.41.0" }));
  assertAccepted(validate(history, { expected: history.two, version: "2.41.0" }));
});

test("a commit outside the history of main, a missing commit and a short SHA are refused", { skip: NO_POWERSHELL }, () => {
  const history = createHistory();
  assertRefused(validate(history, { expected: history.side, version: "2.41.0" }), /not part of the main branch history/);
  assertRefused(validate(history, { expected: "0".repeat(40), version: "2.41.0" }), /does not exist/);
  assertRefused(validate(history, { expected: history.four.slice(0, 7), version: "2.41.0" }), /40-character/);
});

test("only the repository owner on main starts a candidate", { skip: NO_POWERSHELL }, () => {
  const history = createHistory();
  assertRefused(validate(history, { expected: history.four, version: "2.41.0", actor: "someone-else" }), /Only the repository owner/);
  assertRefused(validate(history, { expected: history.four, version: "2.41.0", ref: "refs/heads/side" }), /branch 'main'/);
});

test("a tag is never reused", { skip: NO_POWERSHELL }, () => {
  const history = createHistory();
  assertRefused(validate(history, { expected: history.four, version: "2.39.0" }), /already exists/);
  assertRefused(validate(history, { expected: history.four, version: "2.40.0-dev.1", kind: "dev" }), /already exists/);
});

test("a stable release must be higher than every earlier stable release", { skip: NO_POWERSHELL }, () => {
  const history = createHistory({ "v2.10.0": "two" });
  assertRefused(validate(history, { expected: history.four, version: "2.38.5" }), /must be higher than the existing release v2\.39\.0/);
  assertRefused(validate(history, { expected: history.four, version: "2.9.9" }), /must be higher than the existing release/);
  assertAccepted(validate(history, { expected: history.four, version: "2.39.1" }));
});

test("a stable release must contain every earlier stable release", { skip: NO_POWERSHELL }, () => {
  const history = createHistory({ "v2.39.5": "side" });
  assertRefused(validate(history, { expected: history.four, version: "2.40.0" }), /v2\.39\.5 is not an ancestor/);
});

test("a dev pre-release is not held to the stable ordering", { skip: NO_POWERSHELL }, () => {
  const history = createHistory({ "v2.39.5": "side" });
  assertAccepted(validate(history, { expected: history.three, version: "2.38.1-dev.1", kind: "dev" }));
});

test("the approved commit is checked out detached and verified", { skip: NO_POWERSHELL }, () => {
  const history = createHistory();
  const script = stepScript(jobBlock("build-and-test"), "Check out the approved commit");
  assertAccepted(runPowerShell(script, history.dir, { APPROVED_SHA: history.two }));
  assert.equal(git(history.dir, "rev-parse", "HEAD"), history.two);
  assert.equal(git(history.dir, "branch", "--show-current"), "", "HEAD is detached");
  const missing = runPowerShell(script, history.dir, { APPROVED_SHA: "0".repeat(40) });
  assert.notEqual(missing.status, 0);
  assert.match(missing.failure, /Could not check out the approved commit/);
});
