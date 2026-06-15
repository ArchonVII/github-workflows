# Repository Update Log

This log records agent-visible repository changes that should be easy to audit later. It complements `CHANGELOG.md`: the changelog is user-facing release history, while this file is the operational ledger for what changed in this repo and whether more propagation is needed.

## Entry Template

```markdown
## YYYY-MM-DD - <short title>

- **Issue/PR:** #issue / #pr
- **Branch:** agent/<tool>/<issue>-<slug>
- **Changed paths:** path, path
- **What changed:** One or two sentences.
- **Verification:** Exact commands/results, or docs-only rationale.
- **Propagation:** none | pending <repo/path> | completed <repo/path>
```

## 2026-06-15 - Warning-only document policy lint workflow

- **Issue/PR:** #70 / (pending)
- **Branch:** agent/codex/70-doc-policy-lint
- **Changed paths:** .github/workflows/doc-policy-lint.yml, examples/doc-policy-lint.yml, scripts/doc-policy-lint.mjs, scripts/doc-policy-lint.test.mjs, scripts/workflow-structure.test.mjs, README.md, .changelog/unreleased/70-doc-policy-lint.md, docs/repo-update-log.md
- **What changed:** Added a warning-only reusable `doc-policy-lint` workflow and caller example. The helper checks durable docs status headers, OD4 charter budgets, supersession links, active-doc placeholders, index coherence, and stale active-doc terms near changed current-truth registers without failing the job for findings.
- **Verification:** `npm test` passed 129/129 tests. `C:\Users\josep\go\bin\actionlint.exe .github\workflows\doc-policy-lint.yml examples\doc-policy-lint.yml` exited 0 with no findings.
- **Propagation:** pending `v1` tag movement after merge; consumer required-check promotion is explicitly deferred.

## 2026-06-15 - Friction ledger wiring

- **Issue/PR:** #78 / #79
- **Branch:** agent/claude/78-friction-ledger-wiring
- **Changed paths:** .gitignore, .githooks/scripts/owner-maintenance.sh, .githooks/pre-commit, .githooks/commit-msg, AGENTS.md, .claude/friction.md, docs/repo-update-log.md
- **What changed:** Wired the friction ledger that previously had only its instruction half-propagated: `.gitignore` exception so `.claude/friction.md` is trackable, the ledger added to the owner-maintenance direct-main allowlist (hook case + pre-commit/commit-msg help text) and the AGENTS.md append-log list, and the ledger seeded with the contract header. Part of the OS Stage 1 friction-telemetry rollout (ArchonVII/archon-setup#238).
- **Verification:** `bash -n` clean on the three edited hook scripts; `.claude/friction.md` trackable via the new exception; direct-main append verified post-merge under #238.
- **Propagation:** none (repo-local hook/gitignore wiring; sibling self-apply tracked in ArchonVII/archon-setup#264).

## 2026-06-11 - Governance baseline onboarding

- **Issue/PR:** #38 / (pending)
- **Branch:** agent/codex/38-governance-baseline
- **Changed paths:** AGENTS.md, CLAUDE.md, GEMINI.md, LICENSE, CHANGELOG.md, .changelog/unreleased/README.md, .changelog/unreleased/38-governance-baseline.md, .agent/**, .githooks/**, .github/CODEOWNERS, .github/PULL_REQUEST_TEMPLATE.md, .github/archon-setup.json, .github/dependabot.yml, .gitattributes, .gitignore, docs/agent-process/doc-sweep.md, docs/plans/README.md, docs/repo-update-log.md, package.json, scripts/agent/**, scripts/doc-sweep/**, examples/minimal-ci.yml
- **What changed:** Installed the ArchonVII governance baseline through `archon-setup` onboarding, merged local agent lifecycle commands into `package.json`, added tool pointer files and hooks, and documented this repo's reusable-workflow source-of-truth boundary. Also fixed `examples/minimal-ci.yml` so the no-op shell command parses under YAML/actionlint. Remaining audit drift is intentional: README.md is the workflow catalog, AGENTS.md contains this repo's source-boundary contract, docs/repo-update-log.md is this repo's operational ledger, CHANGELOG.md uses fragment-mode release notes, and `.github/workflows/actionlint.yml` is the reusable workflow body rather than the consumer caller.
- **Verification:** `npm test` passed 122/122. `node C:\GitHub\archon-setup\bin\onboard.mjs C:\GitHub\github-workflows-38-governance-baseline --audit --json` reported 31 present / 0 missing / 5 drifted, with startup readiness complete and remaining drift adjudicated above. `C:\Program Files\Git\bin\bash.exe .githooks/scripts/install-githooks.sh`, `test-owner-maintenance.sh`, `test-checkout-role.sh`, and `bash -n .githooks/commit-msg .githooks/pre-commit .githooks/scripts/*.sh` passed. `C:\Users\josep\go\bin\actionlint.exe` passed across `.github/workflows/*.yml` and `examples/*.yml`.
- **Propagation:** pending archon-setup snapshot refresh after merge.
