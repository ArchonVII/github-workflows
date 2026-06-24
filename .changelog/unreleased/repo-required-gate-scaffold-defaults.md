### Changed

- The `repo-required-gate.yml` caller example now defaults to `stack: node`
  (was `stack: minimal`) and `run-dependency-review: false`. The ArchonVII
  baseline always ships `package.json` + `scripts/**`, so a `minimal` stack made
  the first PR on a freshly scaffolded repo fail the gate's classifier
  (`stack=minimal but code or package files were touched`); and dependency
  review requires GitHub Dependency Graph / Advanced Security, which a freshly
  created repo has disabled. Both stay repo-owned `with:` inputs the owner can
  override, with inline notes on how to opt back into dependency review.
  (ArchonVII/archon-setup#280, ArchonVII/archon-setup#281)
