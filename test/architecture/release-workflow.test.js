"use strict";
// Release candidates use one approved commit and one tested bundle. The GitHub draft is the
// only write operation, and it depends on the complete test and HACS gates.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
    '$expectedSha -ne $actualSha',
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
