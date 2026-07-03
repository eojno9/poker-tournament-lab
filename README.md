# poker-tournament-lab

Off-table tooling for studying MTT preflop/ICM strategy with locally configured precomputed study data.

This repository is a sanitized public source snapshot of a previously private project. Public GitHub
history may not reflect the full private development timeline. Release notes and verification
documents are included to make the project auditable.

## Current Status

- Public repository: <https://github.com/eojno9/poker-tournament-lab>
- License: MIT
- Current public Git tag: `v2.9`
- Public `main` is a sanitized 4-commit source history used for OSS review.
- The `docs/v3.0-*`, `docs/v3.1-*`, and `docs/v3.2-*` files are planning, readiness, public-snapshot, and verification documents. They are not public release tags unless a matching Git tag exists.
- Bundled data artifacts are not included. Users configure their own local data.

## What This Is

`poker-tournament-lab` is a TypeScript monorepo for exploring poker tournament study spots in an
offline lab environment. It focuses on exact-key lookup behavior, safety boundaries, verification
reports, and UI surfaces for reviewing locally configured study data.

It exists to make off-table study workflows easier to inspect, test, and audit without adding
live-play assistance or client integration.

## Who It Is For

- Poker study-tool builders who want a small, inspectable TypeScript codebase.
- Reviewers evaluating how the project separates study tooling from live assistance.
- Developers interested in test-heavy monorepo structure, data-safety guardrails, and release documentation.

## Safety Scope

This project is for off-table study only.

It does not provide:

- real-time assistance or live decision support
- OCR, screen capture, overlays, hotkeys, live watchers, or poker-client integration
- nearest-match recommendations presented as exact results
- automatic use of bundled private data artifacts
- production DB writes through the public workflow

Lookup behavior is intentionally conservative: exact local matches are preferred, fallback output is
labeled, and missing exact results are not disguised as solved strategy.

## Core Features

- Monorepo with shared core logic, Express server, and React/Vite web app.
- Exact-key and canonical-key study helpers.
- Read-only dry-run artifact review surfaces from earlier local verification work.
- Copied-DB rehearsal planning helpers and safety documentation.
- Tests across core, server, and web workspaces.
- Public snapshot and release-readiness documentation under `docs/`.

## Monorepo Structure

```text
apps/server/      Express API and server-side utilities
apps/web/         React/Vite UI
packages/core/    Shared TypeScript helpers and pure domain logic
scripts/          Local development and verification scripts
tests/            Playwright smoke tests
docs/             Plans, release notes, verification, and readiness documents
```

## Setup

Prerequisites:

- Node.js 20 or newer
- npm

Install dependencies:

```powershell
npm.cmd ci
```

For local development:

```powershell
npm.cmd run dev
```

Default web URL:

```text
http://127.0.0.1:5173
```

## Verification Commands

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Optional local smoke test:

```powershell
npm.cmd exec playwright install chromium
npm.cmd run build
npm.cmd run test:smoke
```

The smoke test starts a local Vite preview and runs Playwright against it.

## Release And Documentation Map

- Release history summary: `docs/RELEASE_HISTORY.md`
- Current planning record: `docs/v3.2-plan.md`
- Public GitHub final verification: `docs/v3.2-public-github-final-verification.md`
- Public release wrap-up: `docs/v3.2-release-wrap-up.md`
- v2.9 public tag documentation: `docs/v2.9-plan.md` and related `docs/v2.9-*` reports

## Known Limitations

- Public GitHub history is sanitized and intentionally shorter than the private development history.
- Public refs do not include bundled data artifacts.
- Non-README UTF-8 BOM occurrences are documented as a public-quality cleanup candidate.
- The public repo has low social proof metrics; do not infer adoption from stars, forks, or downloads.
- v3.x documents describe planning/readiness work unless a matching public tag is created.

## Contributing And Security

- Contributing guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`

Please do not open public issues containing secrets, local data files, raw exports, private paths,
email addresses, or other sensitive material.
