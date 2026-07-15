import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const PUBLIC_TEXT_FILES = new Set(["README.md", "SECURITY.md", "CONTRIBUTING.md", "package.json", "package-lock.json", "docs/RELEASE_HISTORY.md"]);
const PUBLIC_TEXT_ROOTS = ["apps/", "packages/", "scripts/", "tests/", ".github/"];

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function parseArgs(argv) {
  const result = { candidateTag: "", expectedCurrentPublicTag: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--candidate-tag") {
      result.candidateTag = argv[index + 1] ?? "";
      index += 1;
    } else if (value === "--expected-current-public-tag") {
      result.expectedCurrentPublicTag = argv[index + 1] ?? "";
      index += 1;
    } else {
      throw new Error(`알 수 없는 인수입니다: ${value}`);
    }
  }
  if (!/^v\d+\.\d+$/.test(result.candidateTag) || !/^v\d+\.\d+$/.test(result.expectedCurrentPublicTag)) {
    throw new Error("candidate tag와 current public tag는 v<major>.<minor> 형식이어야 합니다.");
  }
  return result;
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function isPublicTextFile(fileName) {
  const normalized = normalizePath(fileName);
  if (PUBLIC_TEXT_FILES.has(normalized)) {
    return true;
  }
  return PUBLIC_TEXT_ROOTS.some((root) => normalized.startsWith(root)) && TEXT_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

function hasForbiddenArtifact(fileName) {
  const normalized = normalizePath(fileName).toLowerCase();
  const segments = normalized.split("/");
  const forbiddenDirectories = new Set(["artifacts", "coverage", "dist", "node_modules", "playwright-report", "test-results"]);
  const forbiddenExtensions = [".db", ".db-shm", ".db-wal", ".sqlite", ".sqlite3", ".zip"];
  return (
    segments.some((segment) => forbiddenDirectories.has(segment)) ||
    segments.some((segment) => segment === ".env" || segment.startsWith(".env.")) ||
    forbiddenExtensions.some((extension) => normalized.endsWith(extension)) ||
    /(^|\/)hrc-dry-run-[^/]*\.json$/i.test(normalized)
  );
}

function findPublicTextBlockers(files) {
  const findings = { privacyPath: 0, email: 0, secret: 0, mojibake: 0 };
  const windowsUserPath = new RegExp(["[A-Za-z]:", "\\\\", "Users", "\\\\", "[^\\\\\\r\\n]+"].join(""), "g");
  const unixUserPath = new RegExp(["/", "(?:Users|home)", "/", "[^/\\s]+"].join(""), "g");
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const secretPatterns = [
    new RegExp(["s", "k-(?:proj-)?", "[A-Za-z0-9_-]{16,}"].join(""), "g"),
    new RegExp(["gh", "[pousr]_", "[A-Za-z0-9]{20,}"].join(""), "g"),
    new RegExp(["-----BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE KEY-----"].join(""), "g"),
    new RegExp(
      [
        "(?:[A-Z0-9]+_)?",
        "(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|CLIENT_SECRET)",
        "\\s*[:=]\\s*",
        "['\\\"]?",
        "[^\\s'\\\"]{12,}"
      ].join(""),
      "g"
    )
  ];
  const mojibakePattern = new RegExp(["\\u00c3", "\\u00c2", "\\u00ec", "\\u00eb", "\\u00ed", "\\u00ea", "\\ufffd"].join("|"), "g");

  for (const { text } of files) {
    const pathMatches = [...text.matchAll(windowsUserPath), ...text.matchAll(unixUserPath)].map((match) => match[0]);
    findings.privacyPath += pathMatches.filter(
      (value) => !/(?:<[^>]+>|\[\^|example|placeholder|redacted|test(?:er)?|private-user)/i.test(value)
    ).length;

    const emailMatches = text.match(emailPattern) ?? [];
    findings.email += emailMatches.filter(
      (value) => !/@(?:[^@.]+\.)?example\.(?:com|test|invalid)(?:\.[a-z]+)?$/i.test(value) && !/@localhost$/i.test(value)
    ).length;

    const secretMatches = secretPatterns.flatMap((pattern) => text.match(pattern) ?? []);
    findings.secret += secretMatches.filter((value) => !/(?:example|placeholder|redacted|test|<[^>]+>)/i.test(value)).length;
    findings.mojibake += (text.match(mojibakePattern) ?? []).length;
  }
  return findings;
}

export function evaluatePublicReleasePreflight(state) {
  const expectedReadme = `Current completed public Git tag: \`${state.expectedCurrentPublicTag}\``;
  const expectedHistory = `\`${state.expectedCurrentPublicTag}\` is the current public Git tag.`;
  const checks = [
    { id: "git status", pass: state.statusClean },
    { id: "original remote absent", pass: state.remoteAbsent },
    { id: "package/package-lock", pass: state.packageFilesClean },
    { id: "tracked artifacts", pass: state.trackedArtifacts.length === 0 },
    { id: "privacy/path scan", pass: state.scanFindings.privacyPath === 0 && state.scanFindings.email === 0 },
    { id: "secret scan", pass: state.scanFindings.secret === 0 },
    { id: "mojibake scan", pass: state.scanFindings.mojibake === 0 },
    { id: "README status", pass: state.readmeText.includes(expectedReadme) && !state.readmeText.includes(`Current completed public Git tag: \`${state.candidateTag}\``) },
    { id: "RELEASE_HISTORY status", pass: state.releaseHistoryText.includes(expectedHistory) },
    {
      id: "SECURITY policy",
      pass: /private vulnerability reporting/i.test(state.securityText) && state.securityText.includes("취약점")
    }
  ];
  return { checks, pass: checks.every((check) => check.pass) };
}

export function collectRepositoryState(root, options) {
  const trackedFiles = git(root, ["ls-files"]).split(/\r?\n/).filter(Boolean);
  const textFiles = trackedFiles
    .filter(isPublicTextFile)
    .map((fileName) => ({ fileName, text: readFileSync(path.join(root, fileName), "utf8") }));
  const packageDiff = [
    git(root, ["diff", "--", "package.json", "package-lock.json"]),
    git(root, ["diff", "--cached", "--", "package.json", "package-lock.json"])
  ].filter(Boolean);

  return {
    branch: git(root, ["branch", "--show-current"]),
    head: git(root, ["rev-parse", "HEAD"]),
    candidateTag: options.candidateTag,
    expectedCurrentPublicTag: options.expectedCurrentPublicTag,
    statusClean: git(root, ["status", "--porcelain"]) === "",
    remoteAbsent: git(root, ["remote"]) === "",
    packageFilesClean: packageDiff.length === 0,
    trackedArtifacts: trackedFiles.filter(hasForbiddenArtifact),
    scanFindings: findPublicTextBlockers(textFiles),
    readmeText: readFileSync(path.join(root, "README.md"), "utf8"),
    releaseHistoryText: readFileSync(path.join(root, "docs", "RELEASE_HISTORY.md"), "utf8"),
    securityText: readFileSync(path.join(root, "SECURITY.md"), "utf8")
  };
}

export function formatPreflight(result, state) {
  return [
    "PUBLIC_RELEASE_PREFLIGHT",
    `branch: ${state.branch}`,
    `HEAD: ${state.head}`,
    `candidate tag: ${state.candidateTag}`,
    `expected current public tag: ${state.expectedCurrentPublicTag}`,
    ...result.checks.map((check) => `${check.id}: ${check.pass ? "PASS" : "FAIL"}`),
    `final verdict: ${result.pass ? "PASS" : "FAIL"}`
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const state = collectRepositoryState(root, options);
  const result = evaluatePublicReleasePreflight(state);
  console.log(formatPreflight(result, state));
  process.exitCode = result.pass ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
