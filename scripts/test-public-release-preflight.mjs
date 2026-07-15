import assert from "node:assert/strict";
import { evaluatePublicReleasePreflight } from "./public-release-preflight.mjs";

function validState() {
  return {
    candidateTag: "v4.1",
    expectedCurrentPublicTag: "v4.0",
    statusClean: true,
    remoteAbsent: true,
    packageFilesClean: true,
    trackedArtifacts: [],
    scanFindings: { privacyPath: 0, email: 0, secret: 0, mojibake: 0 },
    readmeText: "Current completed public Git tag: `v4.0`",
    releaseHistoryText: "`v4.0` is the current public Git tag.",
    securityText: "GitHub private vulnerability reporting / 취약점 신고"
  };
}

const cases = [
  ["clean fixture", {}, null],
  ["dirty tree", { statusClean: false }, "git status"],
  ["original remote", { remoteAbsent: false }, "original remote absent"],
  ["package diff", { packageFilesClean: false }, "package/package-lock"],
  ["tracked artifact", { trackedArtifacts: ["artifacts/report.json"] }, "tracked artifacts"],
  ["private path or email", { scanFindings: { privacyPath: 1, email: 1, secret: 0, mojibake: 0 } }, "privacy/path scan"],
  ["secret", { scanFindings: { privacyPath: 0, email: 0, secret: 1, mojibake: 0 } }, "secret scan"],
  ["mojibake", { scanFindings: { privacyPath: 0, email: 0, secret: 0, mojibake: 1 } }, "mojibake scan"],
  ["stale README", { readmeText: "Current completed public Git tag: `v3.9`" }, "README status"],
  ["stale release history", { releaseHistoryText: "`v3.9` is the current public Git tag." }, "RELEASE_HISTORY status"],
  ["missing security policy", { securityText: "public issue" }, "SECURITY policy"]
];

for (const [name, patch, expectedFailure] of cases) {
  const state = { ...validState(), ...patch };
  const result = evaluatePublicReleasePreflight(state);
  if (expectedFailure === null) {
    assert.equal(result.pass, true, `${name} should pass`);
  } else {
    assert.equal(result.pass, false, `${name} should fail`);
    assert.equal(result.checks.find((check) => check.id === expectedFailure)?.pass, false, `${name} should fail ${expectedFailure}`);
  }
}

console.log(`public release preflight fixtures: PASS (${cases.length} cases, 1 positive, ${cases.length - 1} negative)`);
