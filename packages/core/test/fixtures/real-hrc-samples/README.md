# Real HRC Sample Fixture Intake

This folder is reserved for sanitized real HRC export/sample fixtures used by v2.3 compatibility tests.

## Rules

- Do not place raw original HRC export files here.
- Do not place production DB files here.
- Do not import files from this folder into the production SQLite DB.
- Commit only sanitized fixture copies that are safe for repository tests.
- Remove personal paths, user names, player names, local machine names, private notes, and unnecessary local file metadata.
- Preserve HRC export shape, action labels, sizes, frequencies, and EV fields only when they are needed for compatibility testing.
- Keep fixtures read-only and test-only.
- Do not present fixtures as new GTO recommendations or solver results produced by this app.

## Required Metadata

Sanitized fixtures should make their origin explicit:

- `source`: `HRC_PRECOMPUTED_DB`
- `sampleKind`: `REAL_HRC_SAMPLE` or `HRC_SAMPLE`
- `sanitized`: `true`
- `originalTool`: `HRC`
- `streetScope`: `PREFLOP`
- `calculationModel`: `HRC_EXPORT_SAMPLE` or another existing compatible HRC sample label

If no sanitized fixture is present, the v2.3 compatibility test reports `not_provided` and passes.

