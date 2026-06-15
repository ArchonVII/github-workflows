### Added

- `pr-contract.mjs` gains a `--body-file <path|->` (stdin) input mode so the PR
  contract can validate a locally drafted body before a PR exists — the same
  validator now runs identically before and after PR creation. (#81)
- `--help`/usage output for `pr-contract.mjs`, `agent-pr-ready.mjs`, and
  `agent-close-preflight.mjs`. (#81)

### Changed

- The PR-body parser is now context-aware: HTML comments are ignored by the
  placeholder scan, and fenced/inline code and quoted/blockquoted text are
  ignored by the generic-verification scan on free prose. Checked checkbox
  claims and evidence-block field placeholders still hard-fail. (#81)
