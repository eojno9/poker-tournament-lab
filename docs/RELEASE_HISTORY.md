# Release History

This file summarizes public-facing release and planning history without duplicating every detailed
verification note from the rest of `docs/`.

## Public Snapshot Note

This repository is a sanitized public source snapshot of a previously private project. Public GitHub
history may not reflect the full private development timeline. Detailed planning and verification
documents are included so reviewers can audit the safety boundaries and release decisions.

## Current Public Tag

### v4.1

`v4.1` is the current public Git tag.

v4.1 is a maintenance-only update to the stable Korean-first off-table study
workflow. It extracts the Trainer view, adds failure-safe local storage I/O,
maps browser API errors to public-safe Korean-first messages, and provides a
read-only public release preflight. The v4.0 product and safety baseline remains
unchanged.

Start with:

- `docs/v4.1-plan.md`
- `docs/v4.1-closeout.md`
- `docs/v4.1-release-tag-planning.md`
- `docs/v4.1-release-workflow-review.md`

## Later Planning And Verification Documents

The repository includes v3.0, v3.1, v3.2, v3.3, v3.4, v3.5, v3.6, v3.7, v3.8, and v3.9 documents for auditability. These documents describe
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

The v3.8 public release is complete:

- original local tag target: `86a851805ecbbe49d0e824ef650fb82fced5c8f4`
- public sanitized snapshot: `a57593fa07fcc6cc94898c50ddfdab5daa834aca`
- public main after status hotfix: `50fff157c937fa6b8a9711edf1b94e27e1a2eff6`
- public tag: `v3.8`
- public tag target: `a57593fa07fcc6cc94898c50ddfdab5daa834aca`
- latest referenced Actions runs: `29257812623` and `29258154745`, PASS

### v3.9 Planning

v3.9 is the final stabilization planning bundle before v4.0. It audits
remaining practical gaps and fixes the implementation scope around:

- original README and RELEASE_HISTORY status synchronization
- Korean-first copy and accessible names for older non-Trainer screens
- Analyze, Database, and Trainer workflow clarity
- empty/error/not-solved/storage fallback copy consistency
- focused tests and smoke coverage for the above
- CI warning triage if low-risk
- v4.0 entry criteria

The v3.9 scope audit and design step is docs-only and does not change code,
package files, DB/raw/generated artifacts, GitHub refs, or tags.

Start with:

- `docs/v3.9-scope-audit.md`
- `docs/v3.9-plan.md`
- `docs/v3.9-design-bundle.md`
- `docs/v4.0-entry-criteria.md`

The v3.9 implementation bundle stabilizes the core user workflows before v4.0:

- README status now distinguishes the completed `v3.8` public release from
  local v3.9 development.
- Analyze, Browser, Database, and artifact surfaces receive a Korean-first
  accessible-name and state-copy pass where older English-only labels remained.
- Database to Analyze handoff now shows the transferred context, clarifies that
  the user can edit the filled values, and provides a context reset path that
  does not delete presets, recent analyses, Trainer history, or other local
  records.
- Focused smoke coverage verifies Database to Analyze handoff, context reset,
  unrelated local preset preservation, non-Trainer accessible names, HRC
  artifact Korean copy, and existing Analyze/Trainer regressions.
- localStorage key inventory is confirmed without version changes:
  Analyze presets, recent analyses, Trainer recent attempts, Trainer mistakes,
  and Trainer filters remain browser-local.
- local verification: typecheck PASS, test PASS (core 383, server 82, web 118),
  build PASS, smoke PASS (7/7).

This is an implementation record only. `v3.9` local tag creation, public
sanitized upload, GitHub main push, and tag push are not performed in this step.
Closeout and release/tag planning remain separate follow-up work.

The v3.9 closeout and release/tag planning step is also complete:

- closeout verdict: `V3_9_CLOSEOUT_READY`
- release planning verdict: `V3_9_RELEASE_TAG_PLANNING_READY`
- v4.0 entry verdict: `V4_0_ENTRY_READY`
- candidate tag: `v3.9`
- candidate title: `v3.9 - Final workflow stabilization`
- target commit policy: final HEAD produced by the v3.9 closeout docs-only
  commit
- local tag creation, GitHub push, and tag push are not performed in the
  closeout/planning step

The v3.9 public release is complete:

- original local tag target: `10f2ed624296ad749c086929cfc552429d3fc23e`
- public sanitized snapshot: `14b54cca626adad58b394fc320b238eb00b5a7b4`
- public main: `14b54cca626adad58b394fc320b238eb00b5a7b4`
- public tag: `v3.9`
- public tag target: `14b54cca626adad58b394fc320b238eb00b5a7b4`
- latest referenced Actions run: `29321898100`, PASS

Start with:

- `docs/v3.9-plan.md`
- `docs/v3.9-scope-audit.md`
- `docs/v3.9-design-bundle.md`
- `docs/v3.9-closeout.md`
- `docs/v4.0-entry-criteria.md`

### v4.0 Scope And Design

v4.0 is planned as the stable public milestone for the current off-table study
product. It is not a broad new feature line. The plan confirms that Analyze,
Database, Trainer, verification, public docs, and sanitized release mechanics
should be treated as one coherent public workflow.

The v4.0 scope/design bundle is docs-only and does not change code, workflow,
package files, DB/raw/generated artifacts, GitHub refs, or tags.

The v4.0 scope/design bundle records:

- scope verdict: `V4_0_SCOPE_CONFIRMED`
- design verdict: `V4_0_DESIGN_BUNDLE_READY`
- candidate tag: `v4.0`
- candidate title: `v4.0 - Stable off-table study milestone`
- Must items: public status sync, SECURITY copy repair, mojibake UI copy repair,
  unified workflow verification, stable state model, local data contract, and
  release acceptance criteria
- Should items: GitHub Actions official-action deprecation cleanup if the
  update is verified as low-risk, plus manual keyboard and narrow-screen QA
  notes

Start with:

- `docs/v4.0-scope-confirmation.md`
- `docs/v4.0-plan.md`
- `docs/v4.0-design-bundle.md`
- `docs/v4.0-state-model.md`
- `docs/v4.0-local-data-contract.md`
- `docs/v4.0-release-acceptance-criteria.md`
- `docs/v4.0-public-readiness-checklist.md`

The v4.0 implementation bundle establishes the stable workflow baseline:

- README now records `v3.9` as the latest completed public tag and marks v4.0
  as local implementation/release preparation only.
- SECURITY.md reporting guidance is readable UTF-8 Korean and public-safe.
- Trainer tree-config fallback copy is confirmed as `제공되지 않음`, with a
  focused regression test.
- Official GitHub Actions `actions/checkout` and `actions/setup-node` were
  updated to stable `v7` tags after remote tag verification.
- Node.js remains `24`, and no dependency or package-lock change is introduced.
- Local data keys, versions, reset scopes, and fallback behavior remain aligned
  with `docs/v4.0-local-data-contract.md`.
- Local verification is complete: typecheck PASS, test PASS (core `383`, server
  `82`, web `119`), build PASS, smoke PASS (`7/7`).
- Implementation verdict: `V4_0_IMPLEMENTATION_BUNDLE_READY`.
- v4.0 local tag creation, public upload, GitHub push, and tag push are not
  performed in the implementation bundle.

The v4.0 closeout and release/tag planning step is complete:

- closeout verdict: `V4_0_CLOSEOUT_READY`
- release planning verdict: `V4_0_RELEASE_TAG_PLANNING_READY`
- Actions verdict: `ACTIONS_V7_VERIFIED`
- release acceptance verdict: `V4_0_RELEASE_ACCEPTANCE_READY`
- candidate tag: `v4.0`
- candidate title: `v4.0 - Stable off-table study milestone`
- target commit policy: final HEAD produced by the v4.0 closeout docs-only
  commit
- local verification: typecheck PASS, test PASS (core `383`, server `82`, web
  `119`), build PASS, smoke PASS (`7/7`)
- local tag creation, public upload, GitHub push, and tag push are not performed
  in the closeout/planning step

The v4.0 public release is complete:

- original local tag target: `6973439bc4bd5644f954d2ac4a0bfd1ec30ebb84`
- public sanitized snapshot and tag target:
  `a8f1edc2c4a3b288e5b9acd39cd6c527a7e32110`
- public main after the release-status hotfix:
  `7bd50aebb6133aa44f8cccc152df4a0b7d61950d`
- public tag: `v4.0`
- public Actions run `29396539287`: PASS

### v4.1 Maintenance Release

v4.1 is scoped as maintenance-only work after the stable v4.0 milestone. The
scope audit identifies limited structural and reliability improvements without
adding a new product capability:

- incremental `App.tsx` decomposition beginning with Trainer
- consistent failure-safe browser storage access without key/version changes
- public-safe Korean-first API error mapping
- read-only public release status preflight
- smoke organization improvements without coverage reduction

The planning bundle does not change code, workflow, package files, dependencies,
DB/raw/generated artifacts, Git tags, remotes, or GitHub refs.

The local v4.1 maintenance implementation and docs-only closeout are complete.
The work incrementally extracts the Trainer view, centralizes failure-safe
browser storage I/O without changing keys or versions, maps API failures to
Korean-first public messages, and adds a read-only public release preflight.
Typecheck, core `383`, server `82`, web `130`, build, smoke `7/7`, positive
preflight, and ten negative fixtures pass.

The closeout step prepared candidate tag `v4.1` with title
`v4.1 - Maintenance safety and structure` without performing release
operations. The subsequent public release bundle completed the sanitized
snapshot, named tag push, and external verification:

- original tag target: `b684054846ae73b71c5a7f603034fb7cfcdb96ed`
- public snapshot/main and tag target:
  `b695fc83d0667b6abddde8e8636875f40526807b`
- public Actions run `29428578638`: PASS
- force push and bulk tag push: not used

Verdicts:

- scope: `V4_1_SCOPE_CONFIRMED`
- design: `V4_1_DESIGN_BUNDLE_READY`
- release workflow review: `V4_1_RELEASE_WORKFLOW_REVIEW_READY`

Start with:

- `docs/v4.1-scope-audit.md`
- `docs/v4.1-plan.md`
- `docs/v4.1-design-bundle.md`
- `docs/v4.1-maintenance-roadmap.md`
- `docs/v4.1-release-workflow-review.md`
- `docs/v4.1-closeout.md`
- `docs/v4.1-release-tag-planning.md`

### v4.2 Maintenance Scope Audit

v4.2 is planned as a focused maintenance-only update after the completed v4.1
public release. The audit confirms implementation value in four Must areas:

- extract the low-coupling read-only HRC artifact view from `App.tsx`
- make unhandled server errors generic and public-safe with an additive stable
  error code
- support explicit original/public modes in the read-only release preflight
- synchronize durable public-status wording before future snapshots

Smoke fixture cleanup, focused narrow-viewport checks, and pure Analyze handoff
helpers are Should items. Full Analyze, Browser, Database, and Import
decomposition remains v4.3+ work because broad movement is not justified by a
current user-facing defect.

Planning verdicts:

- scope: `V4_2_SCOPE_CONFIRMED`
- design: `V4_2_DESIGN_BUNDLE_READY`
- test maintenance: `V4_2_TEST_MAINTENANCE_READY`
- preflight review: `V4_2_RELEASE_PREFLIGHT_REVIEW_READY`

No v4.2 implementation, local tag, public snapshot, GitHub push, or tag push is
performed by this planning bundle.

The v4.2 maintenance implementation is now complete and locally verified:

- the GET-only HRC artifact screen is extracted from `App.tsx` into a focused
  view while preserving selectors, copy, states, and read-only behavior
- unhandled server exceptions use a fixed Korean response and additive stable
  error code instead of raw exception detail
- frontend API errors recognize allowlisted stable codes and retain safe HTTP
  status fallbacks
- release preflight supports explicit read-only original/public modes and JSON
  stdout, with `28` positive, negative, and non-destructive checks
- the HRC smoke path covers a 390 px viewport and table-local scrolling
- local verification passes: core `383`, server `84`, web `131`, build, and
  smoke `7/7`

This remains a local implementation record. v4.2 closeout, local tag creation,
public sanitized upload, GitHub main push, and tag push have not been performed.
The completed public tag remains `v4.1`.

The v4.2 closeout and release/tag planning bundle is complete:

- HRC boundary verdict: `HRC_VIEW_BOUNDARY_PASS`
- server error verdict: `SERVER_ERROR_SAFETY_PASS`
- frontend mapping verdict: `FRONTEND_ERROR_MAPPING_PASS`
- preflight verdict: `DUAL_MODE_PREFLIGHT_VERIFIED`
- narrow viewport verdict: `NARROW_VIEWPORT_PASS`
- closeout verdict: `V4_2_CLOSEOUT_READY`
- release planning verdict: `V4_2_RELEASE_TAG_PLANNING_READY`
- candidate tag: `v4.2`
- candidate title: `v4.2 - Maintenance boundaries and release checks`
- verification: core `383`, server `84`, web `131`, build PASS, smoke `7/7`

This docs-only closeout does not create the local tag or perform a public
snapshot, GitHub main push, or tag push. `v4.1` remains the current completed
public tag until the separate release bundle succeeds.

Start with:

- `docs/v4.2-scope-audit.md`
- `docs/v4.2-plan.md`
- `docs/v4.2-design-bundle.md`
- `docs/v4.2-component-boundary-review.md`
- `docs/v4.2-test-maintenance-review.md`
- `docs/v4.2-release-preflight-review.md`
- `docs/v4.2-maintenance-roadmap.md`

## Verification

Use the root package scripts for current verification:

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:smoke
```

The smoke test requires Playwright Chromium to be installed locally or in CI.
