# Release History

This file summarizes public-facing release and planning history without duplicating every detailed
verification note from the rest of `docs/`.

## Public Snapshot Note

This repository is a sanitized public source snapshot of a previously private project. Public GitHub
history may not reflect the full private development timeline. Detailed planning and verification
documents are included so reviewers can audit the safety boundaries and release decisions.

## Current Public Tag

### v3.7

`v3.7` is the current public Git tag.

v3.7 records Trainer session and filter workflows for off-table Korean-first study.
It keeps the v3.6 local-only Trainer flow and improves session start/progress/
completion/reset, filter save/restore/reset, mistake review state filters, and
localStorage fallback behavior. It does not add live assistance, production DB
writes, product import routes, or bundled data artifacts to the public repository.

Start with:

- `docs/v3.7-plan.md`
- `docs/v3.7-closeout.md`
- `docs/v3.7-release-tag-planning.md`

## Later Planning And Verification Documents

The repository includes v3.0, v3.1, v3.2, v3.3, v3.4, v3.5, and v3.6 documents for auditability. These documents describe
foundation work, copied-DB rehearsal planning, public-snapshot cleanup, GitHub readiness, command safety planning,
dry-run package script verification, Trainer UX planning, and next-scope Trainer planning.

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

### v3.5 Release

v3.5 focuses on Trainer UX improvements for off-table study,
mistake review, position and filter-based sessions, local accuracy summaries, and
local-only practice history structure. The Trainer session model design is now documented
as a planning artifact, and the mistake review/statistics design is documented. A minimal
Trainer UX implementation plan is also documented before the first code changes.
The minimal Korean-first Trainer UX flow is now implemented with
local-only recent attempts, mistake review, retry/dismiss handling, and local summary
statistics. v3.5 closeout verification, release/tag planning, local annotated tag creation,
GitHub upload preflight, public upload, status hotfix, and final public verification are complete.

The local `v3.5` tag points to `eaaaa3413a313fa0d2476d446b065958a1b52529`. Public upload
used a separately prepared sanitized upload folder rather than the original repository history.
The v3.5 public release final verdict is `V3_5_PUBLIC_RELEASE_COMPLETE`.

Start with:

- `docs/v3.5-plan.md`
- `docs/v3.5-trainer-session-model.md`
- `docs/v3.5-mistake-review-statistics.md`
- `docs/v3.5-minimal-trainer-ux-implementation-plan.md`
- `docs/v3.5-github-upload-preflight.md`

### v3.6 Release

v3.6 focuses on the next Trainer improvement bundle after v3.5:
Trainer UX polish, mistake review UX improvements, session-level study mode,
position/action statistics, localStorage migration/fallback cleanup, Korean-first
copy audit, and v4.0 public readiness planning.

The design stage did not add implementation, dependency changes, DB/raw data access,
generated artifacts, GitHub push, or tag changes. The implementation and public release
steps keep those boundaries while updating the local-only Trainer UX.

Start with:

- `docs/v3.6-plan.md`
- `docs/v3.6-trainer-ux-polish-design.md`
- `docs/v3.6-mistake-review-ux-design.md`
- `docs/v3.6-design-bundle.md`

The v3.6 implementation bundle then applies the approved local-only Trainer
improvements:

- Korean-first Trainer guidance, filter structure, question card, feedback, and empty states
- local session progress card and reset affordance
- clearer mistake review status counts and local-only copy
- compact local summary, recent-window accuracy, position/action stat headings, and session counts
- safer Trainer localStorage fallback for corrupt or unavailable browser storage

No package dependency changes, server persistence, API expansion, bundled data artifacts,
GitHub push, or tag changes are part of this implementation bundle.

The v3.6 closeout and release/tag planning step verifies the implementation bundle
and records the candidate release plan:

- closeout verdict: `V3_6_CLOSEOUT_READY`
- release planning verdict: `V3_6_RELEASE_TAG_PLANNING_READY`
- candidate tag: `v3.6`
- candidate title: `v3.6 - Korean Trainer UX polish`
- verification: typecheck PASS, test PASS, build PASS, smoke PASS
- test count: core 383, server 82, web 110; smoke 7/7
- public release tag: `v3.6`
- public release title: `v3.6 - Korean Trainer UX polish`

### v3.7 Release Planning

v3.7 targets final Trainer completion and v4.0 readiness work before a later
v4.0 review. The scope remains local-only and Korean-first:

- Trainer session start/progress/completion/reset flow
- local filter settings save/restore/reset
- mistake review state filtering
- local statistics range labels
- versioned localStorage migration/fallback rules
- Korean-first copy audit
- accessibility and keyboard baseline checks
- narrow/mobile Trainer layout baseline checks
- concrete v4.0 readiness checklist

The implementation bundle adds local session status/completion UI, versioned
filter save/load/reset, mistake status filters, and fallback tests. It does not
add dependency changes, DB/raw data access, generated artifacts, GitHub push, or
tag changes.

Current implementation verification:

- typecheck: PASS
- test: PASS, core 383 / server 82 / web 114
- build: PASS
- smoke: PASS, 7/7

Closeout and release/tag planning are ready:

- candidate tag: `v3.7`
- candidate title: `v3.7 - Trainer session and filter workflows`
- closeout verdict: `V3_7_CLOSEOUT_READY`
- release planning verdict: `V3_7_RELEASE_TAG_PLANNING_READY`
- local tag creation, GitHub push, and tag push are not performed in the planning step

Start with:

- `docs/v3.7-plan.md`
- `docs/v3.7-design-bundle.md`
- `docs/v3.7-closeout.md`
- `docs/v3.7-release-tag-planning.md`

The v3.7 public release is complete:

- original local tag target: `3719a6d235e1f463f5858796d0c7f93fa25931ae`
- public sanitized snapshot: `dd07aa61e55334b6acb8ad6803ec82d163b425d5`
- public main after status hotfix: `45ec864a787513a0f431a6f3127bc2684ff94bdd`
- public tag: `v3.7`
- latest referenced Actions run: `29197780280`, PASS

### v3.8 Planning

v3.8 plans the final v4.0 readiness gap-closure bundle after the v3.7 public
release. The focus is stability and readiness rather than broad new Trainer
features:

- Trainer state-transition and edge-case audit
- localStorage key/version/migration/fallback review
- accessibility, focus, labels, and keyboard baseline
- narrow/mobile Trainer layout baseline
- Korean-first copy audit
- error, empty, loading, and fallback state consistency
- SECURITY and public-readiness wording review
- v4.0 blocker and non-blocking note separation

The v3.8 plan/design step is docs-only and does not change code, package files,
DB/raw/generated artifacts, GitHub refs, or tags.

The v3.8 implementation bundle closes the approved readiness gaps while keeping
the same public-safe boundaries:

- Trainer state-transition guards for empty candidates, completed sessions,
  resets, context changes, retry paths, and repeated answer submission
- consolidated localStorage fallback coverage for recent attempts, mistakes,
  and filters
- accessibility and keyboard baseline improvements for Trainer controls
- narrow/mobile layout improvements for Trainer filters, cards, actions,
  summaries, mistake review, and local statistics
- Korean-first copy review, neutral public-status README wording, and public-safe
  SECURITY reporting guidance

Current v3.8 implementation verification:

- typecheck: PASS
- test: PASS, core 383 / server 82 / web 118
- build: PASS
- smoke: PASS, 7/7

This is an in-progress implementation record only. v3.8 local tag creation,
public upload, and public tag push have not been performed in this step.

The v3.8 closeout and release/tag planning step verifies the implementation
bundle and records the candidate release plan:

- closeout verdict: `V3_8_CLOSEOUT_READY`
- release planning verdict: `V3_8_RELEASE_TAG_PLANNING_READY`
- v4.0 readiness verdict: `V4_0_READINESS_READY`
- candidate tag: `v3.8`
- candidate title: `v3.8 - v4 readiness gap closure`
- verification: typecheck PASS, test PASS, build PASS, smoke PASS
- test count: core 383, server 82, web 118; smoke 7/7
- local tag creation, GitHub push, and tag push are not performed in the
  planning step

Start with:

- `docs/v3.8-plan.md`
- `docs/v3.8-design-bundle.md`
- `docs/v4.0-readiness-gap-audit.md`
- `docs/v3.8-closeout.md`
- `docs/v3.8-release-tag-planning.md`

## Verification

Use the root package scripts for current verification:

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:smoke
```

The smoke test requires Playwright Chromium to be installed locally or in CI.
