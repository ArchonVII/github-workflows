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

## 2026-06-11 - Governance baseline onboarding

- **Issue/PR:** #38 / (pending)
- **Branch:** agent/codex/38-governance-baseline
- **Changed paths:** AGENTS.md, CLAUDE.md, GEMINI.md, LICENSE, CHANGELOG.md, .changelog/unreleased/README.md, .changelog/unreleased/38-governance-baseline.md, .agent/**, .githooks/**, .github/CODEOWNERS, .github/PULL_REQUEST_TEMPLATE.md, .github/archon-setup.json, .github/dependabot.yml, .gitattributes, .gitignore, docs/agent-process/doc-sweep.md, docs/plans/README.md, docs/repo-update-log.md, package.json, scripts/agent/**, scripts/doc-sweep/**, examples/minimal-ci.yml
- **What changed:** Installed the ArchonVII governance baseline through `archon-setup` onboarding, merged local agent lifecycle commands into `package.json`, added tool pointer files and hooks, and documented this repo's reusable-workflow source-of-truth boundary. Also fixed `examples/minimal-ci.yml` so the no-op shell command parses under YAML/actionlint. Remaining audit drift is intentional: README.md is the workflow catalog, AGENTS.md contains this repo's source-boundary contract, docs/repo-update-log.md is this repo's operational ledger, CHANGELOG.md uses fragment-mode release notes, and `.github/workflows/actionlint.yml` is the reusable workflow body rather than the consumer caller.
- **Verification:** `npm test` passed 122/122. `node C:\GitHub\archon-setup\bin\onboard.mjs C:\GitHub\github-workflows-38-governance-baseline --audit --json` reported 31 present / 0 missing / 5 drifted, with startup readiness complete and remaining drift adjudicated above. `C:\Program Files\Git\bin\bash.exe .githooks/scripts/install-githooks.sh`, `test-owner-maintenance.sh`, `test-checkout-role.sh`, and `bash -n .githooks/commit-msg .githooks/pre-commit .githooks/scripts/*.sh` passed. `C:\Users\josep\go\bin\actionlint.exe` passed across `.github/workflows/*.yml` and `examples/*.yml`.
- **Propagation:** pending archon-setup snapshot refresh after merge.
