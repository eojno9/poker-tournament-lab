# Public Repository Maintenance Checklist

## Purpose

This checklist summarizes the current public GitHub repository state for OSS/Codex
application review and separates release blockers from follow-up maintenance items.

## Current Public Refs

- `main`: `f5d76709fd7f72541fc82896282fd9da1a653125`
- `v2.9`: `88d88ff81c2eff3db4eada0621b68b6de2b0be85`
- `v3.2`: `d7f4b47ce308fc5faa10f78f1b69ef56324fa19e`

## Application Readiness

Verdict: `APPLICATION_REPOSITORY_READY_WITH_NON_BLOCKING_NOTES`.

- README is present and renders with normal UTF-8 text.
- `CONTRIBUTING.md` is present.
- `SECURITY.md` is present.
- `docs/RELEASE_HISTORY.md` is present.
- GitHub Actions latest run is green.
- Node.js 24 or newer requirement is documented.
- Typecheck, tests, build, and smoke verification pass.
- Public-safe blocker scan result: `0`.
- Bundled DB/raw/generated artifacts: `0`.
- Public refs use sanitized history rather than private local history.

## Safety Scope

The public repository is scoped to off-table study tooling.

- No real-time assistance or live decision support.
- No OCR, screen capture, overlays, hotkeys, or live watchers.
- No poker client integration.
- No bundled data artifacts.
- Users configure their own local data.

## Known Non-Blocking Issues

- npm audit warnings: `TRIAGE_RECOMMENDED_SEPARATE_STEP`.
- Older planning-history local backup-root labels: `KEEP_AS_KNOWN_QUALITY_NOTE`.
- One earlier failed GitHub Actions run remains in workflow history before the CI Node.js 24 fix.

These are not treated as current OSS/Codex application blockers.

## Ongoing Maintenance Gates

Before future public updates:

- Keep original private/local history out of the public repo.
- Use sanitized public history only.
- Keep public wording neutral about local data.
- Do not bundle DB/raw/generated data artifacts.
- Keep README, CONTRIBUTING, SECURITY, RELEASE_HISTORY, and CI green.
- Run public-safe scans before pushing.
- Keep original repo remote absent unless a future step explicitly approves otherwise.

## Next Actions

- Draft OSS/Codex application final answer.
- Triage npm audit warnings in a separate dependency-safety step.
- Optionally plan public-history quality cleanup if a zero-quality-note history becomes necessary.
