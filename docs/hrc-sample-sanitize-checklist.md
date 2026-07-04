# Real HRC Sample Sanitize Checklist

This checklist is for v2.3 real HRC sample compatibility work. It is not an import workflow for the production DB.

## Scope

- Use this checklist only for real HRC export files or real HRC-based sample files.
- Do not add raw original HRC exports to git.
- Do not import samples into the production SQLite DB.
- Do not change API, DB schema, import routing, analyzer, fallback, solver, or UI logic during intake.
- Do not present sample data as a new recommendation or as solver output produced by this app.

## Required Sanitization

Before a fixture can be committed, remove or generalize:

- Personal filesystem paths.
- Local project paths.
- Windows user names or account names.
- Machine names.
- Player names.
- Tournament identifiers that are not needed for compatibility testing.
- Private notes or comments.
- Unnecessary export folder names.
- Poker client, live session, screen capture, overlay, or hotkey metadata.

## Fields That May Be Preserved For Compatibility Testing

The following fields may remain when they are needed to test HRC compatibility:

- HRC export shape.
- Spot metadata needed for canonical key construction.
- Action path.
- Tree config.
- Hero position.
- Table size.
- Remaining players.
- Stack and blind metadata.
- Action labels.
- Size labels and raise sizes.
- Frequencies.
- EV, ChipEV, and ICM EV fields.
- Source metadata identifying this as a sanitized HRC sample.

## Required Metadata For Sanitized Fixtures

Sanitized real HRC fixtures should include explicit metadata such as:

- `source`: `HRC_PRECOMPUTED_DB`
- `sampleKind`: `REAL_HRC_SAMPLE` or `HRC_SAMPLE`
- `sanitized`: `true`
- `originalTool`: `HRC`
- `streetScope`: `PREFLOP`
- `calculationModel`: `HRC_EXPORT_SAMPLE` or another existing compatible HRC sample label
- `sourceFile`: sanitized file name only

Do not use v2.2 `TEST_ONLY_SAMPLE` metadata for a real HRC sample. TEST_ONLY fixtures are handcrafted coverage data; v2.3 real HRC samples are sanitized compatibility data from HRC output.

## Review Before Commit

- Confirm raw original files are not staged.
- Confirm production DB files are not staged.
- Confirm no runtime seed data is changed.
- Confirm the sample is located in a test fixture folder.
- Confirm private paths, user names, player names, and local-only metadata are removed.
- Confirm the fixture is clearly marked as sanitized real HRC sample data.
- Confirm the compatibility report records validator pass/fail and shape differences without changing product import logic.

