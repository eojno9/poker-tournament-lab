# Contributing

Thanks for taking a look at `poker-tournament-lab`.

This project is an off-table study tool. Contributions should preserve the safety boundary: no
real-time assistance, no live play workflow, and no poker-client integration.

## Setup

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Optional local smoke test:

```powershell
npm.cmd exec playwright install chromium
npm.cmd run test:smoke
```

## Branches And Pull Requests

- Keep changes focused and reviewable.
- Explain the purpose, user-visible impact, and safety impact of the change.
- Include tests for new logic or changed behavior.
- Update docs when behavior, commands, safety boundaries, or verification steps change.
- Do not claim adoption, users, downloads, sponsorship, or production usage without evidence.

## Safety Rules

Do not add features that provide or enable:

- real-time assistance or live decision support
- OCR, screen capture, overlays, hotkeys, live watchers, or poker-client integration
- nearest-match recommendations presented as exact results
- automatic production DB writes
- bundled private data artifacts

Do not commit:

- `.env` files
- DB files or sidecar files
- raw exports or archive files
- generated reports or large local artifacts
- private local paths
- email addresses
- tokens, API keys, passwords, certificates, or private keys

Use placeholders in docs and tests when a path, identity, or credential-like value is needed.

## Issues

Use public issues for reproducible bugs, documentation gaps, and feature discussions that do not
include sensitive data.

If an issue involves security, private data, local paths, or credentials, follow `SECURITY.md`
instead of posting details publicly.
