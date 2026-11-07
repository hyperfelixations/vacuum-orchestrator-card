// Reports advisories against build and test tooling without failing (SEC-07): none of that code
// ships, but a maintainer should see them. Advisories against runtime dependencies and missing
// registry signatures fail `npm run check:security` instead. Prints Markdown, adds it to the job
// summary in GitHub Actions and warns once there. Fails only when npm audit gives no report.
// See internal dev doc §4 "Abhängigkeits-Sicherheit".

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEVERITIES = ["critical", "high", "moderate", "low", "info"];

const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

// `audit`: the output of `npm audit --json`; `lock`: package-lock.json. A package counts as
// tooling when every installed copy is a dev dependency in the lockfile.
export function summarize(audit, lock) {
  if (!audit || typeof audit !== "object" || audit.error || typeof audit.vulnerabilities !== "object") {
    throw new Error(`report-dev-advisories: npm audit gave no report${audit?.error ? ` (${audit.error.summary ?? audit.error.code})` : ""}`);
  }
  const packages = lock?.packages ?? {};
  const tooling = (entry) => entry.nodes?.length > 0 && entry.nodes.every((node) => packages[node]?.dev === true);
  const entries = Object.values(audit.vulnerabilities);
  const dev = entries.filter(tooling).sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.name.localeCompare(b.name));
  const runtime = entries.length - dev.length;
  const lines = ["## Advisories against build and test tooling", ""];
  if (!dev.length) lines.push("npm audit reports none.");
  else {
    const counts = SEVERITIES.map((severity) => [severity, dev.filter((entry) => entry.severity === severity).length]).filter(([, count]) => count);
    lines.push(`npm audit reports advisories against ${dev.length} ${dev.length === 1 ? "package" : "packages"} (${counts.map(([severity, count]) => `${count} ${severity}`).join(", ")}). None of this code ships in the card; this report does not fail the run.`, "");
    lines.push("| Package | Severity | Advisory | Fix |", "|---|---|---|---|");
    for (const entry of dev) {
      const advisories = entry.via.map((via) => (typeof via === "string" ? `through ${via}` : `[${cell(via.title)}](${via.url})`));
      const fix = entry.fixAvailable === true ? "`npm audit fix`" : entry.fixAvailable ? `${entry.fixAvailable.name} ${entry.fixAvailable.version}${entry.fixAvailable.isSemVerMajor ? " (semver-major)" : ""}` : "none yet";
      lines.push(`| ${cell(entry.name)}${entry.isDirect ? " (direct)" : ""} | ${entry.severity} | ${advisories.join("; ")} | ${fix} |`);
    }
  }
  if (runtime) lines.push("", `${runtime} ${runtime === 1 ? "advisory concerns" : "advisories concern"} runtime dependencies; \`npm run check:security\` fails on ${runtime === 1 ? "it" : "them"}.`);
  return { markdown: `${lines.join("\n")}\n`, tooling: dev.length, runtime };
}

function audit() {
  // npm exits with 1 when it finds an advisory; the report is on stdout either way. A fixed command
  // line through the shell finds npm on every runner, Windows included.
  const result = spawnSync("npm audit --json", { cwd: ROOT, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`report-dev-advisories: npm audit gave no report (exit ${result.status}): ${String(result.stderr).trim()}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  const { markdown, tooling } = summarize(audit(), lock);
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  if (process.env.GITHUB_ACTIONS === "true" && tooling) console.log(`::warning title=Tooling advisories::npm audit reports advisories against ${tooling} build and test ${tooling === 1 ? "package" : "packages"}; see the job summary.`);
}
