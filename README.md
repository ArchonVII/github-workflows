# github-workflows

Reusable GitHub Actions workflow provider for
[@ArchonVII](https://github.com/ArchonVII) repositories.

This repo owns shared workflow bodies, caller examples, PR contract helpers, and
repo setup utilities. Consumer repos opt in by adding small caller workflows
that define their own triggers and call these reusable workflows with
`uses: ArchonVII/github-workflows/.github/workflows/<name>.yml@v1`.

This repo is not an agent persona system. The older admiral/lieutenant-style
role language is retired as operating guidance. Current policy is implemented
through normal GitHub primitives: issues, branches, worktrees, PR contracts,
branch protection, CI checks, labels, reviews, and explicit workflow inputs.

Agent and maintainer governance for this repository lives in [`AGENTS.md`](AGENTS.md). Start there before changing workflows, setup scripts, or PR policy helpers; operational changes are logged in [`docs/repo-update-log.md`](docs/repo-update-log.md).

## Companion Repos

- [`ArchonVII/.github`](https://github.com/ArchonVII/.github) provides
  organization-level community health defaults such as issue forms, PR template,
  `SECURITY.md`, release config, and the starter documentation policy.
- [`ArchonVII/repo-template`](https://github.com/ArchonVII/repo-template)
  bootstraps new repos with caller workflows, repo-local agent policy,
  changelog conventions, dependency config, and baseline docs.
- `ArchonVII/github-workflows` is this provider repo. It keeps reusable workflow
  logic in one place while consumer repos keep local triggers and inputs.

## Operating Model

Every reusable workflow in this repo uses `on: workflow_call`. A consumer repo
adds a thin caller under `.github/workflows/`, chooses the trigger
(`pull_request`, `merge_group`, `schedule`, `workflow_dispatch`, etc.), grants
the required permissions, and pins the reusable workflow to `@v1`.

The recommended branch-protection model is one stable required check:

```text
repo-required-gate / decision
```

Keep path filtering and stack-specific work inside the reusable gate. Do not
make branch protection depend on checks that can be skipped by caller-level path
filters, because GitHub can leave those required checks pending.

The `v1`, `v2`, etc. tags are the public API surface. Backwards-compatible fixes
and additive workflows land on `main` and can move the `v1` tag forward.
Breaking workflow or input changes require a new major tag. Consumers that need
full immutability can pin to a commit SHA instead of `@v1`.

## Workflow Inventory

This repo currently contains 19 reusable `workflow_call` workflows and 2
provider self-test workflows.

### Required Gate And PR Policy

| Workflow | Purpose | Caller |
| --- | --- | --- |
| [`repo-required-gate.yml`](.github/workflows/repo-required-gate.yml) | Single required branch-protection gate. Detects the PR lane and runs the relevant checks before publishing `repo-required-gate / decision`. Supports minimal, Node, Python, Go, polyglot, workflow-only, policy-only, dependency, snapshot, and forced-full lanes. | [`examples/repo-required-gate.yml`](examples/repo-required-gate.yml) |
| [`pr-policy.yml`](.github/workflows/pr-policy.yml) | Validates the PR contract: canonical body sections, linked issue, verification evidence, checked verification item, branch naming, doc-only handling, optional evidence parsing, optional role-separation enforcement, and optional actionlint. | [`examples/pr-policy.yml`](examples/pr-policy.yml) |
| [`pr-body-autoinject.yml`](.github/workflows/pr-body-autoinject.yml) | Adds an intentionally incomplete PR-body scaffold when bots open non-doc PRs with freehand bodies. Human PRs are left alone. | [`examples/pr-body-autoinject.yml`](examples/pr-body-autoinject.yml) |
| [`semantic-pr-title.yml`](.github/workflows/semantic-pr-title.yml) | Enforces Conventional Commit-style PR titles through `amannn/action-semantic-pull-request@v5`. | [`examples/semantic-pr-title.yml`](examples/semantic-pr-title.yml) |
| [`branch-naming.yml`](.github/workflows/branch-naming.yml) | Enforces the branch convention, including `agent/<tool>/<issue>-<slug>` for agent lanes. | [`examples/branch-naming.yml`](examples/branch-naming.yml) |

### CI And Workflow Validation

| Workflow | Purpose | Caller |
| --- | --- | --- |
| [`node-ci.yml`](.github/workflows/node-ci.yml) | Node install, lint, typecheck, test, and build. Auto-detects `npm`, `pnpm`, or `yarn` from lockfiles and supports version/OS matrices. | [`examples/node-ci.yml`](examples/node-ci.yml) |
| [`python-ci.yml`](.github/workflows/python-ci.yml) | Python install, ruff lint, ruff format check, pyright, and pytest. Supports uv or pip and version/OS matrices. | [`examples/python-ci.yml`](examples/python-ci.yml) |
| [`go-ci.yml`](.github/workflows/go-ci.yml) | Discovers tracked `go.mod` files, then runs build, vet, and test per module. Supports excluded modules, optional code generation, dirty-tree drift checks, CGO settings, and version/OS matrices. | [`examples/go-ci.yml`](examples/go-ci.yml) |
| [`actionlint.yml`](.github/workflows/actionlint.yml) | Reusable workflow syntax validation using `raven-actions/actionlint@v2`, with pinned actionlint version and optional shellcheck. | Use from repo-template or call directly. |

### Security And Dependencies

| Workflow | Purpose | Caller |
| --- | --- | --- |
| [`dependency-review.yml`](.github/workflows/dependency-review.yml) | Blocks vulnerable or disallowed dependency changes based on the lockfile diff. | [`examples/dependency-review.yml`](examples/dependency-review.yml) |
| [`auto-merge-dependabot.yml`](.github/workflows/auto-merge-dependabot.yml) | Enables auto-merge for allowed Dependabot update types after required checks pass. | [`examples/auto-merge-dependabot.yml`](examples/auto-merge-dependabot.yml) |

### Docs, Anomalies, And Repo Hygiene

| Workflow | Purpose | Caller |
| --- | --- | --- |
| [`changelog-fragment.yml`](.github/workflows/changelog-fragment.yml) | Requires an added `.changelog/unreleased/*.md` fragment when configured source paths change, with a label-based opt-out. | [`examples/changelog-fragment.yml`](examples/changelog-fragment.yml) |
| [`doc-orphan-detector.yml`](.github/workflows/doc-orphan-detector.yml) | Scheduled backstop for committed docs stranded on pushed branches with no open PR. Reports path-only tracking issues and never commits or pushes. | [`examples/doc-orphan-detector.yml`](examples/doc-orphan-detector.yml) |
| [`doc-policy-lint.yml`](.github/workflows/doc-policy-lint.yml) | Warning-only document-policy lint for durable docs: status headers, charter budgets, supersession links, active-doc placeholders, index coherence, and stale active-doc terms. | [`examples/doc-policy-lint.yml`](examples/doc-policy-lint.yml) |
| [`anomaly-triage.yml`](.github/workflows/anomaly-triage.yml) | Reads a per-PR anomalies file, classifies entries as PR-related or unrelated, posts sticky review comments, and can open downstream issues. | [`examples/anomaly-triage.yml`](examples/anomaly-triage.yml) |
| [`anomaly-to-issue.yml`](.github/workflows/anomaly-to-issue.yml) | On merge, promotes files under `.anomalies/` into GitHub issues with parsed frontmatter. | [`examples/anomaly-to-issue.yml`](examples/anomaly-to-issue.yml) |
| [`labeler.yml`](.github/workflows/labeler.yml) | Thin wrapper around `actions/labeler@v5`. | [`examples/labeler.yml`](examples/labeler.yml) |
| [`stale.yml`](.github/workflows/stale.yml) | Auto-marks and optionally closes stale issues and PRs through `actions/stale@v9`. | [`examples/stale.yml`](examples/stale.yml) |
| [`lock-threads.yml`](.github/workflows/lock-threads.yml) | Locks closed issues and PRs after a configurable inactivity window through `dessant/lock-threads@v5`. | [`examples/lock-threads.yml`](examples/lock-threads.yml) |

### Provider Self-Tests

| Workflow | Purpose |
| --- | --- |
| [`self-test.yml`](.github/workflows/self-test.yml) | Direct repo CI for this provider. Runs `npm test` when scripts or package files change. Consumers should not copy it. |
| [`self-test-go.yml`](.github/workflows/self-test-go.yml) | Direct repo CI proving the in-PR `go-ci.yml` lane against local Go fixtures. Consumers should not copy it. |

## Recommended Consumer Setup

For new repos, prefer starting from
[`ArchonVII/repo-template`](https://github.com/ArchonVII/repo-template). For
existing repos, copy only the caller workflows you need from `examples/`.

Start with the required gate caller:

```yaml
name: Repo Required Gate

on:
  pull_request:
    branches: [main]
    types: [opened, edited, synchronize, reopened, ready_for_review, labeled, unlabeled]
  merge_group:

permissions:
  contents: read
  pull-requests: write

jobs:
  repo-required-gate:
    uses: ArchonVII/github-workflows/.github/workflows/repo-required-gate.yml@v1
    with:
      stack: minimal
```

Then choose a stack:

- `minimal` for docs, policy, and config repos with no language CI.
- `node` for Node projects.
- `python` for Python projects.
- `go` for Go projects.
- `polyglot` when one repo contains multiple language surfaces and the gate
  should route by changed path.

After the first PR run, configure branch protection on `main` to require only:

```text
repo-required-gate / decision
```

Add specialized callers only when the repo needs them. For example, use
`doc-orphan-detector.yml` on repos that allow doc-sweep recovery, use
`doc-policy-lint.yml` when document-policy warnings should be visible without
blocking merges, use `auto-merge-dependabot.yml` only where Dependabot
auto-merge is acceptable, and use standalone `actionlint.yml` when workflow
validation should run outside the required gate.

## PR Contract And Role Separation

The canonical PR body scaffold lives at
[`contracts/pr-template.md`](contracts/pr-template.md). It is intentionally
invalid until the TODOs are replaced with real summary, verification,
docs/changelog, and issue-link content.

`pr-policy.yml` and `repo-required-gate.yml` both use
[`scripts/pr-contract.mjs`](scripts/pr-contract.mjs) for the shared PR contract.
The contract can require:

- `Summary`, `Verification`, `Verification Notes`, `Docs / Changelog`, and
  `Linked Issue` sections.
- A `Closes #N`, `Fixes #N`, or `Refs #N` issue link.
- At least one checked verification item.
- Non-placeholder verification notes.
- Branch names matching the configured convention.

Doc-only PRs can skip the strict body ceremony when every changed file matches
the configured doc-only extensions or prefixes.

Role-separation enforcement is no longer described as a named persona workflow.
The current model is ordinary review control:

- By default, role-separation findings are warnings.
- Consumers may set `enforce-role-separation: true` for protected paths.
- When enforced, protected-path agent PRs need an independent approving review
  as the documented path. The validator retains legacy body-marker
  compatibility for older PRs, but new guidance should use reviews instead of
  named personas.
- Dependabot auto-merge is the explicit automation exception.

## Required Gate Details

The required gate caller listens for `labeled` and `unlabeled` events only to
support the `ci:full` escape hatch. The example caller isolates ordinary label
changes such as `no-changelog` into a `label-skip-*` concurrency group so they
do not start, cancel, or replace the real required-gate run.

If a consumer overrides `force-full-ci-label`, update both the caller guard and
the concurrency expression to match the new label.

The gate's internal lane routing is intentionally conservative:

- Docs-only changes avoid unnecessary language CI.
- Workflow and policy changes run workflow/policy validation.
- Dependency changes can run dependency review.
- Stack changes run the relevant language lane.
- `ci:full` bypasses path routing and runs the full configured surface.

## Repo Setup Script

[`scripts/setup-repo.mjs`](scripts/setup-repo.mjs) applies standard labels and
branch protection to a target repo through the GitHub CLI.

Preview first:

```bash
node scripts/setup-repo.mjs ArchonVII/new-thing --dry-run
```

Apply for a solo-owner repo:

```bash
node scripts/setup-repo.mjs ArchonVII/new-thing --solo
```

Apply normal branch protection with one required approval:

```bash
node scripts/setup-repo.mjs ArchonVII/new-thing
```

The script applies the standard type, severity, priority, effort, status,
workflow, and PRD labels. It also configures default-branch protection:
pull-request requirement, stale-review dismissal, linear history, no force
pushes, no deletions, and resolved conversations.

The script does not write files into the target repo, add caller workflows,
install dependency config, or select required status checks. Use repo-template
or copy caller workflows from `examples/`, then configure the branch-protection
required check after the first workflow run.

## Local Development

Install dependencies:

```bash
npm ci
```

Run the test suite:

```bash
npm test
```

Validate a PR contract from GitHub:

```bash
npm run pr:contract -- --repo ArchonVII/github-workflows --pr 123
```

Run agent closeout preflight before promoting a draft PR:

```bash
npm run agent:close-preflight -- --repo ArchonVII/github-workflows --pr 123
npm run agent:pr-ready -- --repo ArchonVII/github-workflows --pr 123
```

Agents should use `agent:pr-ready` instead of calling `gh pr ready` directly.
The script fetches PR metadata, runs the same PR contract validator used in CI,
prints exact repair failures, and only then promotes the PR when the contract is
valid.

## Why This Repo Exists

The ArchonVII automation layer is intentionally split:

- `.github` supplies organization-level community health defaults.
- `repo-template` gives new repos a full local scaffold.
- `github-workflows` centralizes reusable workflow logic and setup helpers.

That split keeps workflow behavior versioned and reusable without silently
mutating every consumer repo. Consumers opt in, pin a major version, and keep
their repo-local policy and triggers visible in their own `.github/workflows/`
directory.
