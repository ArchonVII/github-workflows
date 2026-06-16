### Added

- Gate-label audit (`scripts/gate-labels.mjs` + `gate-labels.test.mjs`): fails if a
  label declared as a `*-label`/`*-labels` workflow-input default is missing from
  the seed set; reports unreferenced seed labels as informational only. (#83)
- Seed labels `ci:full`, `auto-triaged`, and `doc-orphan`, which reusable
  workflows already reference but were never provisioned. (#83)

### Changed

- Moved the canonical label seed array out of `setup-repo.mjs` into
  `scripts/labels.mjs` so the audit can import it without executing the CLI. (#83)
