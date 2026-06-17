### Added

- Expanded the canonical label seed (`scripts/labels.mjs`) with a common-defaults
  set: release-note aliases (`feature`, `fix`, `breaking-change`), conventional
  work types (`task`, `ci`, `build`), GitHub built-in defaults (`duplicate`,
  `invalid`, `question`, `wontfix`), contributor-onboarding labels (`help wanted`,
  `good first issue`, `contrib-candidate`), and triage states (`needs-info`,
  `needs-reproduction`, `needs-decision`, `ready`). The `feature`/`fix`/`breaking-change`
  aliases close release-note categories declared in `ArchonVII/.github` `release.yml`
  that were previously unseeded. (#87)
