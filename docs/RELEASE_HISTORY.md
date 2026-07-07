# Release History

This file summarizes public-facing release and planning history without duplicating every detailed
verification note from the rest of `docs/`.

## Public Snapshot Note

This repository is a sanitized public source snapshot of a previously private project. Public GitHub
history may not reflect the full private development timeline. Detailed planning and verification
documents are included so reviewers can audit the safety boundaries and release decisions.

## Current Public Tag

### v2.9

`v2.9` is the current public Git tag.

The v2.9 documentation records a controlled off-table dry-run and classification stage. It does not
add live assistance, production DB writes, product import routes, or bundled data artifacts to the
public repository.

Start with:

- `docs/v2.9-plan.md`
- related `docs/v2.9-*` reports

## Later Planning And Verification Documents

The repository includes v3.0, v3.1, v3.2, v3.3, and v3.4 documents for auditability. These documents describe
foundation work, copied-DB rehearsal planning, public-snapshot cleanup, GitHub readiness, command safety planning,
and dry-run package script verification.

They should not be read as public release tags unless a matching Git tag exists.

### v3.0 Documents

v3.0 documents focus on no-write product import foundation design, import preview contracts,
backup/rollback planning, copied-DB-only rehearsal safety, and readiness/release decisions.

Start with:

- `docs/v3.0-plan.md`
- `docs/v3.0-stable-release-decision.md`
- `docs/v3.0-rc1-readiness-review.md`

### v3.1 Documents

v3.1 documents focus on copied DB rehearsal planning helpers: approval, guard, plan, report,
orchestrator, renderer, and isolated rehearsal procedure design.

Start with:

- `docs/v3.1-plan.md`
- `docs/v3.1-stable-release-decision.md`
- `docs/v3.1-rc1-readiness-review.md`

### v3.2 Documents

v3.2 documents focus on OSS/public repository readiness, sanitized public history, GitHub upload
verification, remote tag cleanup, and public release wrap-up.

Start with:

- `docs/v3.2-plan.md`
- `docs/v3.2-public-github-final-verification.md`
- `docs/v3.2-release-wrap-up.md`

### v3.3 Documents

v3.3 documents focus on npm audit triage, public quality review, and copied DB dry-run command planning.

Start with:

- `docs/v3.3-plan.md`
- `docs/v3.3-closeout.md`

### v3.4 Documents

v3.4 documents focus on the dry-run-only copied DB rehearsal package script, post-connection smoke verification,
dependency maintenance, BOM cleanup, artifact hygiene, final release-readiness cleanup, and release/tag planning.

The current v3.4 documents mark `v3.4` as a local tag candidate only. A matching tag is not implied unless it exists in Git.
GitHub upload must use a separately reviewed public-safe workflow; the original repository should not receive a remote or be pushed directly.

Start with:

- `docs/v3.4-plan.md`
- `docs/v3.4-closeout.md`
- `docs/v3.4-final-cleanup.md`
- `docs/v3.4-release-tag-planning.md`
- `docs/v3.4-github-upload-preflight.md`

## Verification

Use the root package scripts for current verification:

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:smoke
```

The smoke test requires Playwright Chromium to be installed locally or in CI.
