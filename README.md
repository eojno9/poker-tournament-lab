# poker-tournament-lab

Korean local web app for poker tournament push/fold study.

## v1 scope

- Imports pre-normalized HRC CSV/JSON databases.
- Uses exact canonical spot matching for `HRC_PRECOMPUTED_DB`.
- Uses fallback ICM EV evaluation only when full FT/SNG-style inputs are present.
- Returns `NOT_SOLVED` instead of guessing when the imported DB has no exact match and fallback inputs are incomplete.
- Regular NLHE only. No PKO, bounty, satellites, postflop solving, OCR, overlays, hotkeys, or live hand watchers.

## Scripts

Use `npm.cmd` in PowerShell on this machine.

One-file launcher (Windows):

```powershell
.\run-all.cmd
.\run-all.cmd import "C:\path\to\HRC-folder"
```

`run-all.cmd` (dev mode) starts API+Web and opens `http://127.0.0.1:5173` automatically.

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
npm.cmd run test
npm.cmd run catalog:hrc -- "C:\path\to\HRC-folder"
npm.cmd run import:hrc-folder -- "C:\path\to\HRC-folder"
npm.cmd run import:hrc-folder -- "C:\path\to\HRC-folder" --dry-run --max-files 5
npm.cmd run import:hrc-folder -- "C:\path\to\HRC-folder" --log-file ".\artifacts\import.log" --report-file ".\artifacts\import-report.json"
npm.cmd run canonical:keys:dry-run
npm.cmd run canonical:keys:apply
```

### Batch import policy

- `import:hrc-folder` scans only `.zip` files.
- `.hrcz` files are discarded by policy and never imported.
- For each zip file, only preflop nodes (`street = 0`) are imported.
- Imports are chunked in batches to avoid oversized API payloads.
- Use `--log-file` to save the execution log.
- Use `--report-file` to save a machine-readable JSON summary (discarded, skipped, failed, imported counts).

### Latest report aliases

- `artifacts/latest-import-report.json`: latest full-folder import verification report.
- `artifacts/latest-verification-report.json`: latest API/DB verification summary.
- `artifacts/latest-canonical-key-report.json`: latest canonical key dry-run/apply reconciliation report.

`artifacts/import-run.json` can be a limited dry-run sample (for example `--max-files 3`) and is not always the full import proof report.
