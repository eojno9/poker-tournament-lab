import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluatePublicReleasePreflight,
  formatPreflightJson,
  parseArgs
} from "./public-release-preflight.mjs";

const scriptPath = fileURLToPath(new URL("./public-release-preflight.mjs", import.meta.url));

function validState(mode = "original") {
  return {
    mode,
    candidateTag: "v4.2",
    expectedCurrentPublicTag: "v4.1",
    expectedOrigin: "https://github.com/eojno9/poker-tournament-lab.git",
    branch: "main",
    statusClean: true,
    remoteNames: mode === "public" ? ["origin"] : [],
    originUrl: mode === "public" ? "https://github.com/eojno9/poker-tournament-lab.git" : "",
    packageFilesClean: true,
    trackedArtifacts: [],
    forbiddenPublicDocs: [],
    scanFindings: { privacyPath: 0, email: 0, secret: 0, mojibake: 0 },
    readmeText: "Current completed public Git tag: `v4.1`",
    releaseHistoryText: "`v4.1` is the current public Git tag.",
    securityText: "GitHub private vulnerability reporting / 취약점 신고",
    localCandidateTagExists: false,
    remoteCandidateTagExists: false,
    remoteMainSha: mode === "public" ? "abc123" : "",
    fastForwardPossible: mode === "public"
  };
}

const originalCases = [
  ["original clean fixture", {}, null],
  ["dirty tree", { statusClean: false }, "git status"],
  ["original remote", { remoteNames: ["origin"] }, "original remote absent"],
  ["package diff", { packageFilesClean: false }, "package/package-lock"],
  ["tracked artifact", { trackedArtifacts: ["artifacts/report.json"] }, "tracked artifacts"],
  ["private path or email", { scanFindings: { privacyPath: 1, email: 1, secret: 0, mojibake: 0 } }, "privacy/path scan"],
  ["secret", { scanFindings: { privacyPath: 0, email: 0, secret: 1, mojibake: 0 } }, "secret scan"],
  ["mojibake", { scanFindings: { privacyPath: 0, email: 0, secret: 0, mojibake: 1 } }, "mojibake scan"],
  ["stale README", { readmeText: "Current completed public Git tag: `v4.0`" }, "README status"],
  ["stale release history", { releaseHistoryText: "`v4.0` is the current public Git tag." }, "RELEASE_HISTORY status"],
  ["missing security policy", { securityText: "public issue" }, "SECURITY policy"],
  ["local candidate tag", { localCandidateTagExists: true }, "local candidate tag absent"]
];

const publicCases = [
  ["public clean fixture", {}, null],
  ["public origin missing", { remoteNames: [], originUrl: "" }, "public origin"],
  ["public origin mismatch", { originUrl: "https://example.test/wrong.git" }, "public origin"],
  ["public branch mismatch", { branch: "release" }, "public branch main"],
  ["public remote main missing", { remoteMainSha: "" }, "remote main available"],
  ["public non-fast-forward", { fastForwardPossible: false }, "fast-forward relationship"],
  ["public candidate tag", { remoteCandidateTagExists: true }, "remote candidate tag absent"],
  ["public internal docs", { forbiddenPublicDocs: ["docs/v3.2-sensitive-history-scan-report.md"] }, "public-safe docs subset"]
];

for (const [name, patch, expectedFailure] of originalCases) {
  assertCase(name, { ...validState("original"), ...patch }, expectedFailure);
}
for (const [name, patch, expectedFailure] of publicCases) {
  assertCase(name, { ...validState("public"), ...patch }, expectedFailure);
}

assert.throws(() => parseArgs([]), /--mode/);
assert.throws(
  () => parseArgs(["--mode", "unknown", "--candidate-tag", "v4.2", "--expected-current-public-tag", "v4.1"]),
  /original.*public/
);
assert.throws(
  () => parseArgs(["--mode", "original", "--candidate-tag", "next", "--expected-current-public-tag", "v4.1"]),
  /v<major>/
);
const jsonState = validState("original");
const jsonResult = evaluatePublicReleasePreflight(jsonState);
assert.equal(JSON.parse(formatPreflightJson(jsonResult, jsonState)).verdict, "PASS");

const integrationCount = runCliIntegrationFixtures();
const source = readFileSync(scriptPath, "utf8");
for (const mutation of ['["push"', '["tag", "-a"', '["remote", "add"', '["remote", "set-url"', '["commit"']) {
  assert.equal(source.includes(mutation), false, `preflight must not contain mutation path ${mutation}`);
}

const pureCount = originalCases.length + publicCases.length + 4;
console.log(
  `public release preflight fixtures: PASS (${pureCount + integrationCount} checks, original/public modes, non-destructive CLI)`
);

function assertCase(name, state, expectedFailure) {
  const result = evaluatePublicReleasePreflight(state);
  if (expectedFailure === null) {
    assert.equal(result.pass, true, `${name} should pass`);
  } else {
    assert.equal(result.pass, false, `${name} should fail`);
    assert.equal(result.checks.find((check) => check.id === expectedFailure)?.pass, false, `${name} should fail ${expectedFailure}`);
  }
}

function runCliIntegrationFixtures() {
  const root = mkdtempSync(path.join(tmpdir(), "ptl-preflight-"));
  const original = path.join(root, "original");
  const publicClone = path.join(root, "public");
  try {
    mkdirSync(path.join(original, "docs"), { recursive: true });
    writeFileSync(path.join(original, "README.md"), "Current completed public Git tag: `v4.1`\n", "utf8");
    writeFileSync(path.join(original, "SECURITY.md"), "GitHub private vulnerability reporting / 취약점 신고\n", "utf8");
    writeFileSync(path.join(original, "CONTRIBUTING.md"), "Public-safe contribution fixture.\n", "utf8");
    writeFileSync(path.join(original, "package.json"), "{}\n", "utf8");
    writeFileSync(path.join(original, "package-lock.json"), "{}\n", "utf8");
    writeFileSync(path.join(original, "docs", "RELEASE_HISTORY.md"), "`v4.1` is the current public Git tag.\n", "utf8");
    git(original, ["init", "-b", "main"]);
    git(original, ["config", "user.name", "Preflight Test"]);
    git(original, ["config", "user.email", "preflight@example.test"]);
    git(original, ["add", "."]);
    git(original, ["commit", "-m", "fixture"]);

    const originalBefore = snapshot(original);
    const originalRun = runCli(original, ["--mode", "original", "--candidate-tag", "v4.2", "--expected-current-public-tag", "v4.1"]);
    assert.equal(originalRun.status, 0, originalRun.stderr);
    assert.match(originalRun.stdout, /final verdict: PASS/);
    assert.deepEqual(snapshot(original), originalBefore);

    git(root, ["clone", original, publicClone]);
    const publicBefore = snapshot(publicClone);
    const publicRun = runCli(publicClone, [
      "--mode", "public",
      "--candidate-tag", "v4.2",
      "--expected-current-public-tag", "v4.1",
      "--expected-origin", original,
      "--json"
    ]);
    assert.equal(publicRun.status, 0, publicRun.stderr);
    assert.equal(JSON.parse(publicRun.stdout).verdict, "PASS");
    assert.deepEqual(snapshot(publicClone), publicBefore);

    const missingMode = runCli(original, ["--candidate-tag", "v4.2", "--expected-current-public-tag", "v4.1"]);
    assert.notEqual(missingMode.status, 0);
    const unknownMode = runCli(original, ["--mode", "unknown", "--candidate-tag", "v4.2", "--expected-current-public-tag", "v4.1"]);
    assert.notEqual(unknownMode.status, 0);
    return 4;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: "utf8" });
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function snapshot(cwd) {
  return {
    head: git(cwd, ["rev-parse", "HEAD"]),
    status: git(cwd, ["status", "--porcelain"]),
    refs: git(cwd, ["show-ref"]),
    remotes: git(cwd, ["remote", "-v"])
  };
}
